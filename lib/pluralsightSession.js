"use strict";
const debug = require('debug')('lorgnette:actions');
const Nightmare = require("nightmare");
require("nightmare-incubus");
const _ = require("lodash");
const delay = require("delay");

const ChromeUA = "Mozilla / 5.0(Macintosh; Intel Mac OS X 10_11_3) AppleWebKit / 537.36(KHTML, like Gecko) Chrome/ 49.0.2623.87 Safari/ 537.36";

/*
 * Represents a class that encapsulates Pluralsight functionality.
 */
class PluralsightSession {
    constructor(opts) {
        this._opts = _.defaults(opts, {
            headless: false,
            fullscreen: false,
            muted: false,
            showClosedCaptioning: false
        });
    }

    *initAsync(nightmare) {
        if (!nightmare) {
            nightmare = new Nightmare({
                show: !this._opts.headless,
                kiosk: !this._opts.headless && this._opts.fullscreen,
                toolbar: false,
                'autoHideMenuBar': true,
                //switches: {
                //    'ignore-certificate-errors': true
                //},
                webPreferences: {
                    webSecurity: false
                }
            });
        }

        this._nightmare = nightmare;
        yield this._nightmare.init();

        yield this._nightmare.useragent(ChromeUA);
        this._nightmare.on('console', function (type) {
            debug("Console Message Received: " + type);
        });

        //Unmute audio (nightmare mutes it by default).
        if (!this._opts.muted)
            yield this._nightmare.setAudioMuted(false);
    }

    *loginAsync(username, password) {
        debug("loginAsync() Navigating to PluralSight");

        try {
            yield this._nightmare.chain()
                .goto('https://www.pluralsight.com')
                .wait(2000) //Wait 2 seconds for the dom/libraries to load.
                .jQuery.ensureJQuery();

            var aSignInText = yield this._nightmare.evaluate(function () {
                return jQuery("a[href='https://app.pluralsight.com/id?']")
                    .first()
                    .text()
                    .trim();
            });

            if (aSignInText === "Sign in") {
                debug("loginAsync() Signing In.");

                yield this._nightmare.chain()
                    .goto("https://app.pluralsight.com/id?")
                    .wait(2500) //This is required as JS resources are continuing to be pulled in.
                    .emulateKeystrokes(username)
                    .emulateKeystrokes([{ keyCode: "Tab" }])
                    .emulateKeystrokes(password);

                try
                {
                    yield this._nightmare.expectNavigation(function () {
                        return this.click('button#login');
                    }, 10000);
                } catch (ex) {
                    debug("loginAsync() Timeout on login, but continuing...");
                }

                debug("loginAsync() Determining result of login.");
                var title = yield this._nightmare.title();

                if (title === "Sign In - Pluralsight") {
                    debug("loginAsync() An error occurred on login.");
                    return false;
                }
                else if (title === "Dashboard | Pluralsight") {
                    debug("loginAsync() Now signed in");
                    return true;
                }
                else {
                    debug("loginAsync() Unexpected title:", title);
                    return false;
                }
            }

            debug("loginAsync() Sign in was not required");
        }
        catch (ex) {
            throw ex;
        }
        return true;
    }
    *getCoursesAsync() {
        debug("getCoursesAsync() starting");

        return yield this._nightmare.chain()
            .jQuery.ensureJQuery()
            .urijs.injectURIJS()
            .wait("#ps-main ol.courses-list li")
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

        yield this._nightmare.jQuery.ensureJQuery();
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
        
        let url = "https://app.pluralsight.com/library/courses/" + id;
        debug("watchCourseAsync() Navigating to ", url);

        try {
            yield this._nightmare.chain()
                .goto(url)
                .wait(1000)
                .jQuery.ensureJQuery();
        }
        catch(ex) {
            debug("Error while navigating to the course page " + ex);
            return;
        }

        //Play in the present window.
        debug("watchCourseAsync() Ensuring course video plays in current window.");
        yield this._nightmare.evaluate(function () {
            jQuery("a.course-hero__button").attr("target", "_self");
        });

        debug("watchCourseAsync() Clicking course video play button.");
        yield this._nightmare.expectNavigation(function () {
            this.click("a.course-hero__button");
        }, 10000);

        let currentUrl = yield this._nightmare.url();
        if (!/https:\/\/app.pluralsight.com\/player.*/.test(currentUrl)) {
            debug("watchCourseAsync() Expected to be on the player page, but we weren't, returning.");
            return;
        }

        yield this._nightmare.chain()
            .wait(1000) //Wait a moment for the player to load.
            .jQuery.ensureJQuery()
            .click("button.icon-close-menu"); //Close the module listing

        if (this._opts.fullscreen) {
            yield this._nightmare.type("window", "f");
        }

        if (this._opts.showClosedCaptioning)
            yield this.setClosedCaptioning(true);
        
        if (this._opts.speed) {
            var speed = _.toNumber(this._opts.speed);
            if (speed != 1) {
                yield this.setSpeed(speed);
            }
        }

        //Monitor the currently playing course...
        var currentStatus = yield this.getCurrentVideoStatusAsync();

        var stuckThreshold = 20;
        var stuckCount = 0;
        var previousCurrentTime = null;

        do {
            yield delay(1000);
            
            if (_.isFunction(monitorCallback)) {
                var result = monitorCallback(currentStatus);
                if (result === true) {
                    debug("watchCourseAsync() Cancellation requested by callback function.");
                    return currentStatus; 
                }
            }

            if (currentStatus.hasNextClipShowing) {
                try {
                    yield this.startWatchNextClipAsync();
                } catch(ex) {
                    debug("An error occurred while attempting to start watching the next clip..." + ex);
                }
            }
            
            if (currentStatus.hasNextModuleShowing) {
                try {
                    yield this.startWatchNextModuleAsync();
                } catch(ex) {
                    debug("An error occurred while attempting to start watching the next module..." + ex);
                }
            }

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

            if (stuckCount > stuckThreshold) {
                try {
                    yield this.gotoDashboard();
                }
                catch(ex) {
                    debug("An error occurred while navigating to the dashboard..." + ex);
                }

                debug("watchCourseAsync() Stuck threshold reached.");
                currentStatus.status = "Course Video Stuck";
                return currentStatus;
            }

            try {
                currentStatus = yield this.getCurrentVideoStatusAsync();
                currentStatus.status = "Watching Course";
            }
            catch(ex) {
                debug("watchCourseAsync() error obtaining current video status.");
                return;
            }
        }
        while (!currentStatus.hasEndOfCourseShowing);

        debug("watchCourseAsync() Completed.");
        currentStatus.status = "Completed Course";
        return currentStatus;
    }
    *startWatchNextClipAsync() {
        return yield this._nightmare.chain()
            .jQuery.ensureJQuery()
            .click(".ps-modal button.continue-to-next-clip");
    }
    *startWatchNextModuleAsync() {
        return yield this._nightmare.chain()
            .jQuery.ensureJQuery()
            .click(".ps-modal button.next-module");
    }
    /*
     *  Gets the last 5 courses that were played from the user's history.
     */
    *getUserHistoryAsync() {
        debug("getUserHistoryAsync() starting");
        debug("getUserHistoryAsync() Retrieving History...");
        var result = yield this._nightmare.chain()
            .jQuery.ensureJQuery()
            .evaluateAsync(function () {
            return jQuery.ajax({
                url: "https://app.pluralsight.com/data/user/history",
                cache: false
            });
        });
        debug("getUserHistoryAsync() finished - " + result.length + " items retrieved.");
        return result;
    }
    /*
     *  Used by the Pluralsight dashboard, this returns the last 10 clips played.
     */
    *getUserHistoryAsync2() {
        debug("getUserHistoryAsync() starting");
        var jQueryVersion = yield this._nightmare.jQuery.ensureJQuery();
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
    /*
     * Retrieves the playlists that have been created by the user.
     */
    *getUserPlaylistsAsync() {
        debug("getPlaylistsAsync() starting");
        debug("getPlaylistsAsync() Retrieving Playlists...");
        var result = yield this._nightmare.chain()
            .jQuery.ensureJQuery()
            .evaluateAsync(function () {
            return jQuery.ajax({
                url: "https://app.pluralsight.com/data/playlists/",
                cache: false
            });
        });
        debug("getPlaylistsAsync() finished - " + result.length + " playlists retrieved.");
        return result;
    }
    /*
     * Gets the status of the currently playing video.
     */
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
            var hasNextClipShowing = completedMessage === "Clip completed!";
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
                hasNextClipShowing: hasNextClipShowing,
                hasNextModuleShowing: hasNextModuleShowing,
                hasEndOfCourseShowing: hasEndOfCourseShowing,
                isBuffering: isBuffering,
                isShowingHelpText: isShowingHelpText,
                isReloading: isReloading,
                hasLoadingFailure: hasLoadingFailure,
                modules: modules
            };
        });

        debug("getCurrentVideoStatus() Completed Getting information about the currently playing video.");
        return status;
    }
    *reloadAfterBufferingFailure() {
        debug("reloadAfterBufferingFailure() starting...");

        yield this._nightmare.expectNavigation(function () {
            return this.click("#buffering-indicator div.help-text a:eq(0)");
        }, 10000);

        debug("reloadAfterBufferingFailure() completed.");
    }
    *reloadAfterLoadingFailure() {
        debug("reloadAfterLoadingFailure() starting...");
        yield this._nightmare.expectNavigation(function () {
            this.click("#loading-failure .help-text a:eq(0)");
        }, 10000);

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

        var newSpeed = yield this._nightmare.chain()
            .click("#playback-speed-control li." + className + " button")
            .evaluate(function () {
                var value = jQuery("#playback-speed-control li.active").text().trim().replace("x", "");
                return parseFloat(value);
            });

        debug("setSpeed() completed. Speed is now " + newSpeed.toPrecision(2));
        return newSpeed;
    }
    *gotoDashboard() {
        debug("gotoDashboard() starting");

        //navigate to the dashboard page.
        try {
            yield this._nightmare.chain()
                .goto("https://app.pluralsight.com/library")
                .wait(2000)
                .jQuery.ensureJQuery();
        }
        catch(ex) {
            debug("An error occurred while navigating to the dashboard" + ex);
            yield this.gotoDashboard();
        }

        debug("gotoDashboard() completed.");
    }
    *logoutAsync() {
        debug("logoutAsync() logging out...");
        yield this._nightmare.expectNavigation(function () {
            this.click("a[href='/library/logout']");
        }, 10000);

        debug("logoutAsync() logged out.");
    }
    end() {
        debug("end() ending browser session.");
        this._nightmare.end();
        debug("end() browser session ended.");
    }
};

module.exports = PluralsightSession;