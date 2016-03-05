'use strict'
var vo = require("vo");
var moment = require("moment");
var _ = require("lodash");
var delay = require("delay");

var Nightmare = require('nightmare');

// Adds evaluateAsync method 
require('nightmare-evaluate-async')(Nightmare);

var log = require('single-line-log').stdout;
var argv = require('minimist')(process.argv.slice(2));

var psUsername = argv.username || process.env.lorgnette_ps_username;
var psPassword = argv.password || process.env.lorgnette_ps_password;

if (!psUsername) {
    console.log("Error: A Pluralsight username must be specified either as a -username argument or via a 'lorgnette_ps_username' environment variable");
    process.exit(1);
}

if (!psPassword) {
    console.log("Error: A Pluralsight password must be specified either as a -password argument or via a 'lorgnette_ps_password' environment variable");
    process.exit(1);
}

vo(run)(function (err, result) {
    if (err) throw err;
});

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
    else
        return yield db.getRandomCourseAsync();

    return null;
}

function* run() {
    var lorgnette = require("./lib");

    log("Starting PluralSight Kiosk...");
    log.clear();

    var ps = new lorgnette.PluralsightSession(null, argv);
    var db = new lorgnette.PluralsightRepository();
    
    log("Logging in...");
    log.clear();
    var loginSuccess = yield ps.loginAsync(psUsername, psPassword);
    if (!loginSuccess) {
        log("Unable to log into Pluralsight: Check your username/password.");
        log.clear();
        yield ps.end();
        return;
    }

    var courseListingStatus = yield db.getCourseListingStatusAsync();

    var now = moment();
    if (argv.forceCourseListingUpdate || (!courseListingStatus || moment(courseListingStatus.lastRetrieved).isBefore(now.subtract(7, 'days')))) {
        log("Retrieving course listing... (this will take a moment)");
        log.clear();
        var courses = yield ps.getAllCoursesAsync();
        var results = yield db.putCourseListingsAsync(courses);

        if (!courseListingStatus)
            courseListingStatus = {};
        courseListingStatus.lastRetrieved = now.toDate();
        courseListingStatus.count = courses.length;

        var statusResult = yield db.putCourseListingStatusAsync(courseListingStatus);
        log("Updated course listing...");
        log.clear();
    }
    
    var course = yield getNextCourse(ps, db, true);

    if (!course) {
        log("Unable to find the specified course.");
        log.clear();
        yield ps.end();
        return;
    }

    var watchNext = true;
    while (watchNext == true) {

        log("Watching ", course.title, ". Duration: ", course.duration + " (" + course._id + ")");
        log.clear();
        courseListingStatus.lastCourseWatched = course._id;

        yield db.putCourseListingStatusAsync(courseListingStatus);

        var currentStatus = yield ps.watchCourseAsync(course, function (currentStatus) {
            
            var openModule = _.find(currentStatus.modules, { isOpen: true });
            var selectedClip = _.find(openModule.clips, { selected: true });

            var moduleTitle = _.get(openModule, "title");
            var clipTitle = _.get(selectedClip, "title");

            log("Currently playing module '" + moduleTitle + "' - '" + clipTitle + "' " + currentStatus.currentTime + " / " + currentStatus.totalTime);
        });

        log.clear();
        log("Stopped watching video: ", currentStatus.status + " ", course.title);
        log.clear();

        switch (currentStatus.status) {
            case "Completed Course":
                course = yield getNextCourse(ps, db, false);
                break;
            case "Course Video Stuck":
                log("Course video was stuck. Continuing.");
                break;
            default:
                log("Didn't expect this! Exiting! ", course.title);
                log.clear();
                watchNext = false;
                break;
        }
    }

    yield ps.logoutAsync();
    yield ps.end();
}