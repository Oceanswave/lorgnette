"use strict"
const debug = require('debug')('lorgnette:actions');
const Nightmare = require("nightmare");
const _ = require("lodash");

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

class Pluralsight {
    constructor(nightmare, opts) {
        this._opts = _.defaults(opts, {
            headless: false,
            fullscreen: false
        });

        if (!nightmare) {
            nightmare = Nightmare({
                show: !this._opts.headless,
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
    }
    *loginAsync(username, password) {
        debug("loginAsync() Navigating to PluralSight");
        var aSignInText = yield this._nightmare
            .goto('https://www.pluralsight.com')
            .evaluate(function () {
                var aSignIn = document.querySelector("a[href='https://app.pluralsight.com/id?']");
                if (!aSignIn)
                    return null;
                return aSignIn.innerText;
            });
        
        if (aSignInText === "Sign in") {
            yield this._nightmare.click("a[href='https://app.pluralsight.com/id?']")
                .wait("input[id='Username']")
                .type("input[id='Username']", username)
                .type("input[id='Password']", password)
                .click("button[id='login']")
                .wait("#ps-main");
            debug("loginAsync() Now signed in");
            return true;
        }

        debug("loginAsync() Sign in was not required");
        return false;
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
    *getAllCoursesAsync(count) {
        if (!count)
            count = 10000;
        debug("getAllCoursesAsync() starting");
        var jQueryVersion = yield this.ensureJQueryAsync();
        debug("getAllCoursesAsync() Retrieving Courses...");
        var result = yield this._nightmare.evaluateAsync(function (count) {
            return jQuery.ajax("https://app.pluralsight.com/library/search/api?i=1&q1=course&x1=categories&count=" + count);
        }, count);
        debug("getAllCoursesAsync() finished - " + result.resultcount.pageupper + " results returned of " + result.resultcount.total);
        return result.resultsets[0].results;
    }
    *startWatchCourseAsync(course) {
        if (!course)
            throw "A course must be supplied.";
        var url = "https://app.pluralsight.com/library/courses/" + course.prodId;
        debug("startWatchCourseAsync() Navigating to ", url);

        yield this._nightmare.goto(url)
            .wait();

        var jQueryVersion = yield this.ensureJQueryAsync();

        //Play in the present window.
        debug("startWatchCourseAsync() Ensuring course video plays in current window.");
        yield this._nightmare.evaluate(function () {
            jQuery("a.course-hero__button").attr("target", "_self");
        });

        debug("startWatchCourseAsync() Clicking course video play button.");
        yield this._nightmare.click("a.course-hero__button")
            .wait()
            .click("button.icon-close-menu");

        if (this._opts.fullscreen)
            yield this._nightmare.wait(5000).type("window", "f");
    }
    *startWatchNextModuleAsync(course) {
        var jQueryVersion = yield this.ensureJQueryAsync();
        var result = yield this._nightmare.click(".ps-modal button.next-module");
        return result;
    }
    *getCurrentVideoStatus() {
        var jQueryVersion = yield this.ensureJQueryAsync();
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
            var hasNextModuleShowing = jQuery(".ps-modal button.next-module").length === 1;
            return {
                currentTime: currentTime,
                totalTime: totalTime,
                hasNextModuleShowing: hasNextModuleShowing
            }
        });

        return status;
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

module.exports = Pluralsight;

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