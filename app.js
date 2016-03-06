'use strict'
var vo = require("vo");
var moment = require("moment");
var _ = require("lodash");
var delay = require("delay");
var colors = require("colors");

var Nightmare = require('nightmare');

// Adds evaluateAsync method 
require('nightmare-evaluate-async')(Nightmare);

var log = require('single-line-log').stdout;
var argv = require('minimist')(process.argv.slice(2));

var psUsername = argv.username || process.env.lorgnette_ps_username;
var psPassword = argv.password || process.env.lorgnette_ps_password;

if (!psUsername) {
    console.error("Error: A Pluralsight username must be specified either as a -username argument or via a 'lorgnette_ps_username' environment variable");
    process.exit(1);
}

if (!psPassword) {
    console.error("Error: A Pluralsight password must be specified either as a -password argument or via a 'lorgnette_ps_password' environment variable");
    process.exit(1);
}

vo(run)(function (err, result) {
    if (err) throw err;
});

function* ensureCourseListingIsCurrent(ps, db, force) {
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

function* getNextCourse(ps, db, isStarting) {

    if (isStarting) {
        if (argv.startAt)
            return yield db.getCourseByIdAsync(argv.startAt);
        else if (argv.continue) {
            var history = yield ps.getUserHistoryAsync();
            if (history && history.length > 0) {
                var lastCourse = _.head(history);
                return yield db.getCourseByIdAsync(lastCourse.course.name);
            }
        }
    }

    if (argv.playlist) {
        var playlists = yield ps.getUserPlaylistsAsync();
        var selectedPlaylist = _.find(playlists, { name: argv.playlist });
        
        //RuhRoh.
        if (!selectedPlaylist)
            throw "The specified playlist cound not be found: " + argv.playlist;

        var history = yield ps.getUserHistoryAsync();

        //If the immediate history indicates that a course in the playlist has been watched, start from playlist position n + 1.
        if (history && history.length > 0) {
            var lastCourse = _.head(history);
            var existingIndex = _.findIndex(selectedPlaylist.playlistItems, { "course.name": lastCourse.name });
            if (existingIndex > -1 && existingIndex < selectedPlaylist.playlistItems.length - 1) {
                return yield db.getCourseByIdAsync(selectedPlaylist.playlistItems[existingIndex + 1].course.name);
            }

            //If we're about to loop around, and thenStop has been specified as an argument, don't return a course.
            if (!isStarting && argv.thenStop)
                return null;
        }

        //Otherwise start at the first course in the playlist.
        return yield db.getCourseByIdAsync(_.head(selectedPlaylist.playlistItems).course.name);
    }
    else if (argv.search) {
        var courses = yield ps.getAllCoursesAsync({ q: argv.search });
        if (courses && courses.length > 0) {
            var course = _.sample(courses);
            return yield db.getCourseByIdAsync(course.courseName);
        }
    }
    else {
        yield ensureCourseListingIsCurrent(ps, db, isStarting && argv.forceCourseListingUpdate);
        return yield db.getRandomCourseAsync();
    }

    return null;
}

function* run() {
    var lorgnette = require("./lib");

    if (argv.delayFor) {
        console.log("Delaying start for " + argv.delayFor + " seconds.\r\n");

        for (var i = argv.delayFor; i >= 0; i--) {
            var dur = moment.duration(i, 'seconds')
            log("Starting in " + dur.hours() + "h" + dur.minutes() + "m" + dur.seconds() + "s");
            yield delay(1000);
        }
        log("");
        log.clear();
    }

    var stopTime = null;
    if (argv.watchFor || argv.watchAbout) {
        stopTime = moment().add(argv.watchAbout || argv.watchFor, "minutes");
    }

    if (argv.watchAbout) {
        //Add 30% randomness
        var span = moment.duration(argv.watchAbout, "minutes").asSeconds() * 0.3;
        var rand = _.random(span * -1, span, false);
        stopTime = stopTime.add(rand, "seconds");
    }

    if (stopTime != null) {
        console.log("Watching until", stopTime.format("lll") + "\r\n");
    }

    console.log("Starting Pluralsight Kiosk...".bold.underline.white);

    var ps = new lorgnette.PluralsightSession(null, argv);
    var db = new lorgnette.PluralsightRepository();
    
    console.log("Logging in...".bold.green);

    var loginSuccess = yield ps.loginAsync(psUsername, psPassword);
    if (!loginSuccess) {
        console.error("Unable to log into Pluralsight: Check your username/password.");
        yield ps.end();
        return;
    }

    var watchNext = true;

    var course = yield getNextCourse(ps, db, true);

    if (!course) {
        if (argv.thenStop)
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
        console.log("Stopped watching video: ", currentStatus.status + " ", course.title);

        switch (currentStatus.status) {
            case "Completed Course":
                console.log("Completed Course, moving on to the next one.".bold.green);
                course = yield getNextCourse(ps, db, false);

                if (!course) {
                    if (argv.thenStop)
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
    yield ps.end();
}