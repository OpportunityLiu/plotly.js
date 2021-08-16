'use strict';

var Lib = require('../../lib');
var setConvertCartesian = require('../cartesian/set_convert');

var deg2rad = Lib.deg2rad;
var rad2deg = Lib.rad2deg;

/**
 * setConvert for smith axes!
 *
 * @param {object} ax
 *   axis in question (works for both radial and angular axes)
 * @param {object} smithLayout
 *   full smith layout of the subplot associated with 'ax'
 * @param {object} fullLayout
 *   full layout
 *
 * Here, reuse some of the Cartesian setConvert logic,
 * but we must extend some of it, as both radial and angular axes
 * don't have domains and angular axes don't have _true_ ranges.
 *
 * Moreover, we introduce two new coordinate systems:
 * - 'g' for geometric coordinates and
 * - 't' for angular ticks
 *
 * Radial axis coordinate systems:
 * - d, c and l: same as for cartesian axes
 * - g: like calcdata but translated about `realaxis.range[0]` & `smith.hole`
 *
 * Angular axis coordinate systems:
 * - d: data, in whatever form it's provided
 * - c: calcdata, turned into radians (for linear axes)
 *      or category indices (category axes)
 * - t: tick calcdata, just like 'c' but in degrees for linear axes
 * - g: geometric calcdata, radians coordinates that take into account
 *      axis rotation and direction
 *
 * Then, 'g'eometric data is ready to be converted to (x,y).
 */
module.exports = function setConvert(ax, smithLayout, fullLayout) {
    setConvertCartesian(ax, fullLayout);

    switch(ax._id) {
        case 'x':
        case 'realaxis':
            setConvertRadial(ax, smithLayout);
            break;
        case 'imaginaryaxis':
            setConvertAngular(ax, smithLayout);
            break;
        case 'realaxis2':
            setConvertReal(ax, smithLayout);
            break;
    }
};

function setConvertReal(ax, smithLayout) {
    var subplot = smithLayout._subplot;
    var radius = subplot.radius;

    ax.setGeometry = function() {
        ax.c2g = function(v) {
            var sq = function(x) { return x * x; };
            var gammaX = function(re) {
                var denom = sq(re + 1.0);
                var result = (sq(re) - 1.0) / denom;
                return result;
            };
        // console.log(v, gammaX(v));

            return gammaX(v);
        };

        ax.g2c = function(v) {
            return (v + 1.0) / (1.0 - v);
        };

        ax.g2p = function(v) {
            return v * radius;
        };

        ax.c2p = function(v) { return ax.g2p(ax.c2g(v)); };
    };
}

function setConvertRadial(ax, smithLayout) {
    var subplot = smithLayout._subplot;

    ax.setGeometry = function() {
        var rl0 = ax._rl[0];
        var rl1 = ax._rl[1];

        var b = subplot.innerRadius;
        var m = (subplot.radius - b) / (rl1 - rl0);
        var b2 = b / m;

        var rFilter = rl0 > rl1 ?
            function(v) { return v <= 0; } :
            function(v) { return v >= 0; };

        ax.c2g = function(v) {
            var r = ax.c2l(v) - rl0;
            return (rFilter(r) ? r : 0) + b2;
        };

        ax.g2c = function(v) {
            return ax.l2c(v + rl0 - b2);
        };

        ax.g2p = function(v) { return v * m; };
        ax.c2p = function(v) { return ax.g2p(ax.c2g(v)); };
    };
}

function toRadians(v, unit) {
    return unit === 'degrees' ? deg2rad(v) : v;
}

function fromRadians(v, unit) {
    return unit === 'degrees' ? rad2deg(v) : v;
}

function setConvertAngular(ax) {
    var _d2c = ax.d2c;
    var _c2d = ax.c2d;

    ax.d2c = function(v, unit) { return toRadians(_d2c(v), unit); };
    ax.c2d = function(v, unit) { return _c2d(fromRadians(v, unit)); };

    // override makeCalcdata to handle thetaunit and special theta0/dtheta logic
    ax.makeCalcdata = function(trace, coord) {
        var arrayIn = trace[coord];
        var len = trace._length;
        var arrayOut, i;

        var _d2c = function(v) { return ax.d2c(v, trace.thetaunit); };

        if(arrayIn) {
            if(Lib.isTypedArray(arrayIn)) {
                if(len === arrayIn.length) {
                    return arrayIn;
                } else if(arrayIn.subarray) {
                    return arrayIn.subarray(0, len);
                }
            }

            arrayOut = new Array(len);
            for(i = 0; i < len; i++) {
                arrayOut[i] = _d2c(arrayIn[i]);
            }
        } else {
            var coord0 = coord + '0';
            var dcoord = 'd' + coord;
            var v0 = (coord0 in trace) ? _d2c(trace[coord0]) : 0;
            var dv = (trace[dcoord]) ? _d2c(trace[dcoord]) : (ax.period || 2 * Math.PI) / len;

            arrayOut = new Array(len);
            for(i = 0; i < len; i++) {
                arrayOut[i] = v0 + i * dv;
            }
        }

        return arrayOut;
    };

    // N.B. we mock the axis 'range' here
    ax.setGeometry = function() {
        var rad2g = function(v) { return v; };
        var g2rad = function(v) { return v; };

        var rad2c, c2rad;
        var rad2t, t2rad;

        c2rad = rad2c = Lib.identity;
        t2rad = deg2rad;
        rad2t = rad2deg;

        ax.range = [0, 360];

        ax.c2g = function(v) { return rad2g(c2rad(v)); };
        ax.g2c = function(v) { return rad2c(g2rad(v)); };

        ax.t2g = function(v) { return rad2g(t2rad(v)); };
        ax.g2t = function(v) { return rad2t(g2rad(v)); };
    };
}
