"use strict";
var moment = require("moment");
var _ = require("lodash");
var delay = require("delay");
var colors = require("colors");
var log = require('single-line-log').stdout;

var PluralsightSession = require("./pluralsightSession");
var PluralsightRepository = require("./pluralsightRepository");

class PluralsightController {
    constructor(psUsername, psPassword, opts) {
        this._psUsername = psUsername;
        this._psPassword = psPassword;

        this._opts = _.defaults(opts, {
            headless: false,
            muted: false,
            fullscreen: false,
            showClosedCaptioning: false,
            speed: 1.0,
            startAt: null,
            continue: false,
            playlist: null,
            thenStop: false,
            search: null,
            fresh: false,
            delayFor: null,
            delayStart: null,
            watchFor: null,
            watchAbout: null,
            forceCourseListingUpdate: false
        });
    };

    *ensureCourseListingIsCurrent(ps, db, force) {
        var courseListingStatus = yield db.getCourseListingStatusAsync();
    
        if (force || !courseListingStatus || moment(courseListingStatus.lastRetrieved).isBefore(moment().subtract(7, 'days'))) {
            console.log("Retrieving course listing... (this will take a moment)".bold.yellow);
            var courses = yield ps.getAllCoursesAsync();
            var results = yield db.putCourseListingsAsync(courses);
    
            if (!courseListingStatus)
                courseListingStatus = {};
            courseListingStatus.lastRetrieved = moment().toDate();
            courseListingStatus.count = courses.length;
    
            var statusResult = yield db.putCourseListingStatusAsync(courseListingStatus);
            console.log("Updated course listing...".bold.green);
        }
    };

    *getNextCourse(ps, db, isStarting) {
    
        if (isStarting) {
            if (this._opts.startAt)
                return yield db.getCourseByIdAsync(this._opts.startAt);
            else if (this._opts.continue) {
                let history = yield ps.getUserHistoryAsync();
                if (history && history.length > 0) {
                    var lastCourse = _.head(history);
                    return yield db.getCourseByIdAsync(lastCourse.course.name);
                }
            }
        }
    
        if (this._opts.playlist) {
            let playlists = yield ps.getUserPlaylistsAsync();
            let selectedPlaylist = _.find(playlists, { name: this._opts.playlist });
    
            //RuhRoh.
            if (!selectedPlaylist)
                throw "The specified playlist cound not be found: " + this._opts.playlist;
    
            let history = yield ps.getUserHistoryAsync();
    
            //If the immediate history indicates that a course in the playlist has been watched, start from playlist position n + 1.
            if (history && history.length > 0) {
                let lastCourse = _.head(history);
                let existingIndex = _.findIndex(selectedPlaylist.playlistItems, { "course.name": lastCourse.name });
                if (existingIndex > -1 && existingIndex < selectedPlaylist.playlistItems.length - 1) {
                    return yield db.getCourseByIdAsync(selectedPlaylist.playlistItems[existingIndex + 1].course.name);
                }
    
                //If we're about to loop around, and thenStop has been specified as an argument, don't return a course.
                if (!isStarting && this._opts.thenStop)
                    return null;
            }
    
            //Otherwise start at the first course in the playlist.
            return yield db.getCourseByIdAsync(_.head(selectedPlaylist.playlistItems).course.name);
        }
        else if (this._opts.search) {
            let courses = yield ps.getAllCoursesAsync({ q: this._opts.search });
    
            if (courses && courses.length > 0) {
                let course = null;
    
                if (this._opts.fresh) {
                    let watchedCourses = yield db.getWatchedCoursesAsync();
                    if (watchedCourses.length == courses.length) {
                        if (this._opts.thenStop)
                            return null;
    
                        course = _.sample(courses);
                    }
                    else {
                        do
                        {
                            course = _.sample(courses);
                        }
                        while (_.find(watchedCourses, {courseName: course.courseName}))
                    }
                }
                else {
                    course = _.sample(courses);
                }
    
                return yield db.getCourseByIdAsync(course.courseName);
            }
        }
        else {
            yield this.ensureCourseListingIsCurrent(ps, db, isStarting && this._opts.forceCourseListingUpdate);
            return yield db.getRandomCourseAsync();
        }
    
        return null;
    };

    *run() {
        if (this._opts.delayFor) {
            console.log("Delaying start for " + this._opts.delayFor + " seconds.\r\n");

            for (var i = this._opts.delayFor; i >= 0; i--) {
                let dur = moment.duration(i, 'seconds');
                log("Starting in " + dur.hours() + "h" + dur.minutes() + "m" + dur.seconds() + "s");
                yield delay(1000);
            }
            log("");
            log.clear();
        }

        let stopTime = null;
        if (this._opts.watchFor || this._opts.watchAbout) {
            stopTime = moment().add(this._opts.watchAbout || this._opts.watchFor, "minutes");
        }

        if (this._opts.watchAbout) {
            //Add 30% randomness
            var span = moment.duration(this._opts.watchAbout, "minutes").asSeconds() * 0.3;
            var rand = _.random(span * -1, span, false);
            stopTime = stopTime.add(rand, "seconds");
        }

        if (stopTime != null) {
            console.log("Watching until", stopTime.format("lll") + "\r\n");
        }

        console.log("Starting Pluralsight Kiosk...".bold.underline.white);

        let ps = new PluralsightSession(this._opts);
        yield ps.initAsync();

        let db = new PluralsightRepository();

        console.log("Logging in...".bold.green);

        var loginSuccess = yield ps.loginAsync(this._psUsername, this._psPassword);
        if (!loginSuccess) {
            console.error("Unable to log into Pluralsight: Check your username/password.");
            //ps.end();
            return;
        }

        var watchNext = true;

        var course = yield this.getNextCourse(ps, db, true);

        if (!course) {
            if (this._opts.thenStop)
                console.log("Playlist completed. Stopping.".bold.green);
            else
                console.log("Unable to find a course to play given the supplied arguments.".bold.yellow);
            watchNext = false;
        }

        while (watchNext == true) {

            var courseListingStatus = yield db.getCourseListingStatusAsync();

            console.log("Watching".underline.bold.white, course.title.underline.bold.white, ". Duration:", course.duration + "(" + course._id + ")");
            courseListingStatus.lastCourseWatched = course._id;

            yield db.putCourseListingStatusAsync(courseListingStatus);

            var currentStatus = yield ps.watchCourseAsync(course, function (currentStatus) {

                var openModule = _.find(currentStatus.modules, { isOpen: true });
                var selectedClip = _.find(openModule.clips, { selected: true });

                var moduleTitle = _.get(openModule, "title");
                var clipTitle = _.get(selectedClip, "title");

                log("Currently playing module '" + moduleTitle.bold.cyan + "' - '" + clipTitle + "' " + currentStatus.currentTime + " / ".bold.yellow + currentStatus.totalTime);

                //If a stop time is defined, and the current time is after the stop time, request cancellation.
                if (stopTime && moment().isAfter(stopTime)) {
                    currentStatus.status = "End of time allocated";
                    return true;
                }
            });

            log.clear();
            console.log();

            if (!currentStatus) {
                console.log("Failure navigating to course player. Continuing.".bold.yellow);
                return;
            }


            console.log("Stopped watching video: ", currentStatus.status + " ", course.title);

            switch (currentStatus.status) {
                case "Completed Course":
                    console.log("Completed Course, moving on to the next one.".bold.green);
                    yield db.putWatchedCourseAsync(course);

                    course = yield this.getNextCourse(ps, db, false);

                    if (!course) {
                        if (this._opts.thenStop)
                            console.log("Playlist completed. Stopping.".bold.green);
                        else
                            console.log("Unable to find a course to play.".bold.yellow);

                        watchNext = false;
                    }
                    break;
                case "Course Video Stuck":
                    console.log("Course video was stuck. Continuing.".bold.yellow);
                    break;
                case "End of time allocated":
                    watchNext = false;
                    break;
                default:
                    console.log("Didn't expect this! Exiting!".bold.red);
                    watchNext = false;
                    break;
            }
        }

        console.log("Logging out...".bold.green);
        yield ps.gotoDashboard();
        yield ps.logoutAsync();
        ps.end();
    };
}

module.exports = PluralsightController;
