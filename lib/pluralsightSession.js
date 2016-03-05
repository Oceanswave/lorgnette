"use strict"
const debug = require('debug')('lorgnette:actions');
const Nightmare = require("nightmare");
const _ = require("lodash");
const delay = require("delay");

//Define a few custom actions on Nightmare.
Nightmare.action('hasJQuery', function (done) {
    this.evaluate_now(function () {
        return typeof(jQuery) === "undefined";
    }, done);
});

Nightmare.action('getJQueryVersion', function (done) {
    this.evaluate_now(function () {
        if (typeof (jQuery) === "undefined")
            return undefined;
        else
            return jQuery.fn.jquery;
    }, done);
});

//Use a class to define our functionality -- the "nightmare.use" functionality I don't understand or is overly complicated...

class PluralsightSession {
    constructor(nightmare, opts) {
        this._opts = _.defaults(opts, {
            headless: false,
            fullscreen: false,
            muted: false,
            showClosedCaptioning: false
        });

        if (!nightmare) {
            nightmare = Nightmare({
                show: !this._opts.headless,
                kiosk: !this._opts.headless && this._opts.fullscreen,
                toolbar: false,
                'auto-hide-menu-bar': true,
                //switches: {
                //    'ignore-certificate-errors': true
                //},
                webPreferences: {
                    webSecurity: false
                }
            });
            nightmare.useragent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.116 Safari/537.36");
        }

        this._nightmare = nightmare;
        this._nightmare.on('console', function (type) {
            debug("Console Message Received: " + type);
        });

        //Unmute audio (nightmare mutes it by default).
        if (!this._opts.muted)
            this._nightmare.setAudioMuted(false);
    }
    *loginAsync(username, password) {
        debug("loginAsync() Navigating to PluralSight");
        yield this._nightmare
            .goto('https://www.pluralsight.com')
            .wait();

        var jQueryVersion = yield this.ensureJQueryAsync();

        var aSignInText = yield this._nightmare.evaluate(function () {
            return jQuery("a[href='https://app.pluralsight.com/id?']")
                .first()
                .text()
                .trim();
        });

        if (aSignInText === "Sign in") {
            debug("loginAsync() Signing In");
            yield this._nightmare.click("a[href='https://app.pluralsight.com/id?']");

            //Wait a spell...
            yield delay(1000);

            yield this._nightmare.type("input[id='Username']", username);
            yield this._nightmare.type("input[id='Password']", password);

            yield delay(1000);

            yield this._nightmare.click("button[id='login']");

            yield delay(1000);

            var loginErrorExists = yield this._nightmare.exists("div.alert.error");
            var psMainExists = yield this._nightmare.exists("#ps-main");

            if (loginErrorExists) {
                debug("loginAsync() An error occurred on login.");
                return false;
            }
            else if (psMainExists) {
                debug("loginAsync() Now signed in");
                return true;
            }
            else
                throw "Unknown error occurred while logging in.";
        }

        debug("loginAsync() Sign in was not required");
        return true;
    }
    *ensureJQueryAsync() {
        debug("ensureJQueryAsync() getting jQuery Version");
        var jQueryVersion = yield this._nightmare
            .getJQueryVersion();

        if (!jQueryVersion) {
            debug("ensureJQuery() jQuery not found - injecting jQuery.");
            jQueryVersion = yield this._nightmare.inject("js", "./node_modules/jquery/dist/jquery.min.js")
                .getJQueryVersion();
            debug("ensureJQuery() injected jQuery version " + jQueryVersion);
        }

        if (!jQueryVersion)
            throw "Unable to inject jQuery.";

        return jQueryVersion;
    }
    *injectURIAsync() {
        debug("injectURIAsync() started");
        this._nightmare.inject("js", "./node_modules/urijs/src/uri.min.js");
        var result = yield this._nightmare.evaluate(function () {
            return typeof URI === "function";
        });
        if (result === true)
            debug("injectURIAsync() injected URI");
        else
            debug("injectURIAsync() unable to inject URI");

        return result;
    }
    *getCoursesAsync() {
        debug("getCoursesAsync() starting");
        var jQueryVersion = yield this.ensureJQueryAsync();
        yield this.injectURIAsync();

        var result = yield this._nightmare.wait("#ps-main ol.courses-list li")
            .evaluate(function () {
                var courses = jQuery("#ps-main ol.courses-list li");
                var result = [];
                jQuery.each(courses, function (ix, course) {
                    var title = jQuery(course).find('.courses-list__item-headers a').text();
                    var url = jQuery(course).find('.courses-list__item-headers a').attr('href');
                    result.push({
                        title: title,
                        url: new URI(url).absoluteTo(window.location.href).toString()
                    });
                });
                return result;
            });

        return result;
    }
    *getAllCoursesAsync(opts) {
        debug("getAllCoursesAsync() starting");

        opts = _.defaults(opts, {
            i: 1,
            q1: "course",
            x1: "categories",
            count: 10000,
            q: undefined
        });

        var jQueryVersion = yield this.ensureJQueryAsync();
        debug("getAllCoursesAsync() Retrieving Courses...", opts);
        var result = yield this._nightmare.evaluateAsync(function (opts) {
            return jQuery.ajax({
                url: "https://app.pluralsight.com/library/search/api",
                cache: false,
                data: opts
            });
        }, opts);
        debug("getAllCoursesAsync() finished - " + result.resultcount.pageupper + " results returned of " + result.resultcount.total);
        return result.resultsets[0].results;
    }
    *watchCourseAsync(course, monitorCallback) {
        if (!course)
            throw "A course must be supplied.";
        
        var id = null;
        if (_.isObject(course))
            id = course.prodId;
        else
            id = course;
        
        var url = "https://app.pluralsight.com/library/courses/" + id;
        debug("watchCourseAsync() Navigating to ", url);

        yield this._nightmare.goto(url);

        yield delay(1000);

        var jQueryVersion = yield this.ensureJQueryAsync();

        //Play in the present window.
        debug("watchCourseAsync() Ensuring course video plays in current window.");
        yield this._nightmare.evaluate(function () {
            jQuery("a.course-hero__button").attr("target", "_self");
        });

        debug("watchCourseAsync() Clicking course video play button.");
        yield this._nightmare.click("a.course-hero__button")
            .wait();
        
        //Wait a moment for the player to load.
        yield delay(1000);

        yield this.ensureJQueryAsync();

        //Close the module listing.
        yield this._nightmare.click("button.icon-close-menu");

        if(this._opts.fullscreen)
            yield this._nightmare.type("window", "f");

        if (this._opts.showClosedCaptioning)
            yield this.setClosedCaptioning(true);
        
        if (this._opts.speed) {
            var speed = _.toNumber(this._opts.speed)
            if (speed != 1) {
                yield this.setSpeed(speed);
            }
        }

        //Monitor the currently playing course...
        var currentStatus = yield this.getCurrentVideoStatusAsync();

        var stuckThreshhold = 20;
        var stuckCount = 0;
        var previousCurrentTime = null;

        do {
            yield delay(1000);
            
            if (_.isFunction(monitorCallback))
                monitorCallback(currentStatus);

            if (currentStatus.hasNextModuleShowing)
                yield this.startWatchNextModuleAsync();

            if (currentStatus.currentTime === previousCurrentTime) {
                debug("watchCourseAsync() Stuck count incremented. ", stuckCount);
                stuckCount++;
            }
            else {
                if (stuckCount > 0) {
                    debug("watchCourseAsync() Stuck count cleared.");
                    stuckCount = 0;
                }
                previousCurrentTime = currentStatus.currentTime;
            }

            if (stuckCount > stuckThreshhold) {
                //navigate to the dashboard page.
                yield this._nightmare.goto("https://app.louralsight.com/library");

                yield delay(1000);
                
                yield this.ensureJQueryAsync();

                debug("watchCourseAsync() Stuck threshold reached.");
                currentStatus.status = "Course Video Stuck";
                return currentStatus;
            }

            currentStatus = yield this.getCurrentVideoStatusAsync();
            currentStatus.status = "Watching Course";
        }
        while (!currentStatus.hasEndOfCourseShowing);

        debug("watchCourseAsync() Completed.");
        currentStatus.status = "Completed Course";
        return currentStatus;
    }
    *startWatchNextModuleAsync(course) {
        var jQueryVersion = yield this.ensureJQueryAsync();
        var result = yield this._nightmare.click(".ps-modal button.next-module");
        return result;
    }
    //Used by the history page
    *getUserHistoryAsync() {
        debug("getUserHistoryAsync() starting");
        var jQueryVersion = yield this.ensureJQueryAsync();
        debug("getUserHistoryAsync() Retrieving History...");
        var result = yield this._nightmare.evaluateAsync(function () {
            return jQuery.ajax({
                url: "https://app.pluralsight.com/data/user/history",
                cache: false
            });
        });
        debug("getUserHistoryAsync() finished - " + result.length + " items retrieved.");
        return result;
    }
    //Alternate mechanism used by the dashboard
    *getUserHistoryAsync2() {
        debug("getUserHistoryAsync() starting");
        var jQueryVersion = yield this.ensureJQueryAsync();
        debug("getUserHistoryAsync() Retrieving History...");
        var result = yield this._nightmare.evaluateAsync(function () {
            return jQuery.ajax({
                url: "https://app.pluralsight.com/learner/user/history/recent?perPage=100",
                cache: false
            });
        });
        debug("getUserHistoryAsync() finished - " + result.collection.length + " of " + result.totalResults + " retrieved.");
        return result.collection;
    }
    *getUserPlaylistsAsync() {
        debug("getPlaylistsAsync() starting");
        var jQueryVersion = yield this.ensureJQueryAsync();
        debug("getPlaylistsAsync() Retrieving Playlists...");
        var result = yield this._nightmare.evaluateAsync(function () {
            return jQuery.ajax("https://app.pluralsight.com/data/playlists/");
        });
        debug("getPlaylistsAsync() finished - " + result.length + " playlists retrieved.");
        return result;
    }
    *getCurrentVideoStatusAsync() {
        debug("getCurrentVideoStatus() Getting information about the currently playing video.");
        var status = yield this._nightmare.evaluate(function () {
            //Gotta make it hard 'eh
            var currentTime = jQuery("#currenttime-control").clone()    //clone the element
                .children() //select all the children
                .remove()   //remove all the children
                .end()  //again go back to selected element
                .text()
                .replace("/", "")
                .trim();
            var totalTime = jQuery("#currenttime-control .total-time").text();
            var courseTitle = jQuery("#course-title h1").text();

            var modules = [];
            var elemModules = jQuery("#side-menu .modules .module");
            jQuery.each(elemModules, function (ix, module) {
                var title = jQuery(module).find("h2").text();
                var duration = jQuery(module).find("div.duration").text();
                var isOpen = jQuery(module).hasClass("open");
                
                var clips = [];
                var elemClips = jQuery(module).find(".clips li");
                jQuery.each(elemClips, function (ix, clip) {
                    var title = jQuery(clip).find(".title").text();
                    var duration = jQuery(clip).find(".duration").text();
                    var selected = jQuery(clip).hasClass("selected");
                    var watched = jQuery(clip).hasClass("watched");
                    clips.push({
                        title: title,
                        duration: duration,
                        selected: selected,
                        watched: watched
                    });
                });
                modules.push({
                    title: title,
                    duration: duration,
                    isOpen: isOpen,
                    clips: clips
                });
            });
            
            var completedMessage = jQuery(".ps-modal p.completed-message").text();
            var hasNextModuleShowing = completedMessage === "Module completed!";
            var hasEndOfCourseShowing = completedMessage === "Course completed!";

            //Stuff surrounding video playback and quality.
            var isBuffering = jQuery("#buffering-indicator").hasClass("active");
            var isShowingHelpText = !!jQuery("#buffering-indicator div.help-text");
            var isReloading = !!jQuery("video-clip-loading-indicator");
            var hasLoadingFailure = !!jQuery("#loading-failure");

            return {
                courseTitle: courseTitle,
                currentTime: currentTime,
                totalTime: totalTime,
                completedMessage: completedMessage,
                hasNextModuleShowing: hasNextModuleShowing,
                hasEndOfCourseShowing: hasEndOfCourseShowing,
                isBuffering: isBuffering,
                isShowingHelpText: isShowingHelpText,
                isReloading: isReloading,
                hasLoadingFailure: hasLoadingFailure,
                modules: modules
            }
        });

        debug("getCurrentVideoStatus() Completed Getting information about the currently playing video.");
        return status;
    }
    *reloadAfterBufferingFailure() {
        debug("reloadAfterBufferingFailure() starting...");
        yield this._nightmare.click("#buffering-indicator div.help-text a:eq(0)")
            .wait();
        debug("reloadAfterBufferingFailure() completed.");
    }
    *reloadAfterLoadingFailure() {
        debug("reloadAfterLoadingFailure() starting...");
        yield this._nightmare.click("#loading-failure .help-text a:eq(0)")
            .wait();
        debug("reloadAfterLoadingFailure() completed.");
    }
    *setClosedCaptioning(value) {
        debug("showClosedCaptioning() starting...");

        if (value)
            yield this._nightmare.click("#cc-on");
        else
            yield this._nightmare.click("#cc-off");

        var closedCaptioningOn = yield this._nightmare.evaluate(function () {
            return jQuery("#closed-captioning-settings li:eq(0)").hasClass("selected");
        });
        debug("showClosedCaptioning() completed. Closed captioning is now " + closedCaptioningOn);
        return closedCaptioningOn;
    }
    *setSpeed(value) {
        debug("setSpeed() starting...");
        var speed = value.toPrecision(2);

        debug("setSpeed() setting speed to ", speed);
        var className = "playback-speed-" + speed.replace(".", "_");
        yield this._nightmare.click("#playback-speed-control li." + className + " button");

        var newSpeed = yield this._nightmare.evaluate(function () {
            var value = jQuery("#playback-speed-control li.active").text().trim().replace("x", "");
            return parseFloat(value);
        });

        debug("setSpeed() completed. Speed is now " + newSpeed.toPrecision(2));
        return newSpeed;
    }
    *logoutAsync() {
        debug("logoutAsync() logging out...");
        yield this._nightmare.click("a[href='/library/logout']")
            .wait();
        debug("logoutAsync() logged out.");
    }
    *end() {
        debug("end() ending browser session.");
        yield this._nightmare.end();
        debug("end() browser session ended.");
    }
};

module.exports = PluralsightSession;

/*
var ensureJQuery = exports.ensureJQuery = function* (nightmare) {
    debug("ensureJQuery() getting jQuery Version");
    var jQueryVersion = yield nightmare
        .getJQueryVersion();
    
    if (!jQueryVersion) {
        debug("ensureJQuery() jQuery not found - injecting jQuery.");
        jQueryVersion = yield nightmare.inject("js", "./node_modules/jquery/dist/jquery.min.js")
            .getJQueryVersion();
        debug("ensureJQuery() injecting jQuery version " + jQueryVersion);
    }

    if (!jQueryVersion)
        throw "Unable to inject jQuery.";

    return jQueryVersion;
};

var login = exports.login = function (username, password) {
    return function (nightmare) {
        nightmare
            .goto('https://www.pluralsight.com')
            .click("a[href='https://app.pluralsight.com/id?']")
            .type("input[id='Username']", username)
            .type("input[id='Password']", password)
            .click("button[id='login']")
    }
};

var getCourses = exports.getCourses = function (fn) {
    return function (nightmare) {
        
    };
};*/