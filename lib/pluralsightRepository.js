"use strict"
const debug = require('debug')('lorgnette:repository');
const Promise = require("bluebird");
const PouchDB = require("pouchdb");
const moment = require("moment");
const _ = require("lodash");

class PluralsightRepository {
    constructor() {
        this._db = new PouchDB('.pluralsight');
        Promise.promisifyAll(this._db);
    }
    *getCourseListingStatusAsync() {
        try {
            var courseListingStatus = yield this._db.getAsync("courseListingStatus");
        }
        catch (err) {
            if (err.status != 404)
                throw err;
        }
        debug("getCourseListingStatus() retrieved course listing status.", courseListingStatus);
        return courseListingStatus;
    }
    *getCourseByIdAsync(courseId) {
        debug("getCourseByIdAsync() retrieving specified course... ", courseId);
        try {
            var result = yield this._db.get("course_" + courseId);
            return result;
        }
        catch (err) {
            if (err.status !== 404)
                throw err;
        }

        return result;
    }
    *getRandomCourseAsync() {
        try {
            var courses = yield this._db.allDocsAsync({
                startkey: 'course_',
                endkey: 'course_\uffff'
            });
            var randomCourse = _.sample(courses.rows);
        }
        catch (err) {
            throw err;
        }

        debug("getRandomCourseAsync() retrieving random course... ", randomCourse);
        try {
            var result = yield this._db.get(randomCourse.id);
            return result;
        }
        catch (err) {
            throw err;
        }
    }
    *putCourseListingStatusAsync(courseListingStatus) {
        courseListingStatus = _.defaults(courseListingStatus, {
            _id: "courseListingStatus"
        });

        try {
            var result = yield this._db.putAsync(courseListingStatus);
            debug("putCourseListingStatus() finished putting course listing status.", result);
        }
        catch (err) {
            throw err;
        }

        return result;
    }
    *putCourseListingsAsync(courses) {
        var results = [];
        for (var course of courses) {
            _.set(course, "_id", "course_" + course.prodId);

            try {
                var existingCourse = yield this._db.getAsync(course._id);
                _.set(course, "_rev", existingCourse._rev);
            }
            catch (err) {
                if (err.status != 404)
                    throw err;
            }

            try {
                var result = yield this._db.putAsync(course);
                results.push(result);
                debug("putCourseListings() put course.", result);
            }
            catch (err) {
                throw err;
            }
        }
        
        return results;
    }
}

module.exports = PluralsightRepository;