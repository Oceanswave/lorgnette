'use strict'
var vo = require("vo");
var moment = require("moment");
var _ = require("lodash");

var Nightmare = require('nightmare');
//Note: if you see the maxEventEmitters reached errors, open ipc.js in /nightmare and add Emitter.defaultMaxListeners = 0;
//https://github.com/segmentio/nightmare/issues/282

// Adds evaluateAsync method 
require('nightmare-evaluate-async')(Nightmare);

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

function* run() {
    var Pluralsight = require("./lib/pluralsight.js");
    var PluralsightRepository = require("./lib/pluralsightRepository.js");

    console.log("Starting PluralSight Kiosk...");

    var ps = new Pluralsight(null, argv);
    var db = new PluralsightRepository();

    console.log("Logging in...");
    yield ps.loginAsync(psUsername, psPassword);

    var courseListingStatus = yield db.getCourseListingStatusAsync();

    var now = moment();
    if (argv.forceCourseListingUpdate || (!courseListingStatus || moment(courseListingStatus.lastRetrieved).isBefore(now.subtract(7, 'days')))) {
        console.log("Retrieving course listing...");
        var courses = yield ps.getAllCoursesAsync();
        var results = yield db.putCourseListingsAsync(courses);

        if (!courseListingStatus)
            courseListingStatus = {};
        courseListingStatus.lastRetrieved = now.toDate();
        courseListingStatus.count = courses.length;

        var statusResult = yield db.putCourseListingStatusAsync(courseListingStatus);
        console.log("Updated course listing...");
    }
    
    var course = null;
    if (argv.startAt)
        course = yield db.getCourseByIdAsync(argv.startAt);
    else 
        course = yield db.getRandomCourseAsync();
    
    console.log("Watching ", course.title, ". Duration: ", course.duration);
    yield ps.startWatchCourseAsync(course);

    var interval = setInterval(vo(function* () {
        var currentStatus = yield ps.getCurrentVideoStatus();
        console.log(currentStatus);
        if (currentStatus.hasNextModuleShowing)
            yield ps.startWatchNextModuleAsync();
    }), 1000);

    //yield ps.logoutAsync();
}