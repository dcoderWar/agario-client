'use strict';

module.exports = {
    range
};

// Author: Alexander Dickson (http://stackoverflow.com/users/31671/alex) on Oct 9 '10 at 2:54
// Source: http://stackoverflow.com/a/3895521 (http://stackoverflow.com/posts/3895521/revisions)
// Lic.  : CC BY-SA 2.5 (http://creativecommons.org/licenses/by-sa/2.5/) [Attribution Required]
// Github: https://github.com/alexanderdickson (https://gist.github.com/alexanderdickson)

function range(start, end, step) {
    var range = [];
    var typeofStart = typeof start;
    var typeofEnd = typeof end;

    if (step === 0) {
        throw TypeError("Step cannot be zero.");
    }

    if (typeofStart == "undefined" || typeofEnd == "undefined") {
        throw TypeError("Must pass start and end arguments.");
    } else if (typeofStart != typeofEnd) {
        throw TypeError("Start and end arguments must be of same type.");
    }

    typeof step == "undefined" && (step = 1);

    if (end < start) {
        step = -step;
    }

    if (typeofStart == "number") {

        while (step > 0 ? end >= start : end <= start) {
            range.push(start);
            start += step;
        }

    } else if (typeofStart == "string") {

        if (start.length != 1 || end.length != 1) {
            throw TypeError("Only strings with one character are supported.");
        }

        start = start.charCodeAt(0);
        end = end.charCodeAt(0);

        while (step > 0 ? end >= start : end <= start) {
            range.push(String.fromCharCode(start));
            start += step;
        }

    } else {
        throw TypeError("Only string and number types are supported");
    }

    return range;

}