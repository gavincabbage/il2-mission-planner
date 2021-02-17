var assert = require('chai').assert;

var util = require('./util.js');
var xhrMock = require('xhr-mock');
xhrMock.setup();

describe('util', function() {

    it('must be defined', function() {
        assert.isDefined(util);
    });

    describe('util.formatTime', function() {

        it('must be defined', function() {
            assert.isDefined(util.formatTime);
        });

        var tests = [
            {
                given: 120,
                expected: '2:00'
            },
            {
                given: 119,
                expected: '1:59'
            },
            {
                given: 121,
                expected: '2:01'
            },
            {
                given: 0,
                expected: '0:00'
            }
        ];

        tests.forEach(function(test) {
            it('must return '+test.expected+' given '+test.given, function() {
                assert.strictEqual(util.formatTime(test.given), test.expected);
            });
        });
    });

    describe('util.isAvailableMapHash', function() {

        it('must be defined', function() {
            assert.isDefined(util.isAvailableMapHash);
        });

        var mockMaps = {
            stalingrad: {
                hash: '#stalingrad',
                selectIndex: 0
            },
            other: {
                hash: '#other',
                selectIndex: 1
            }
        };

        var tests = [
            {
                given: '#stalingrad',
                expected: true
            },
            {
                given: '#none',
                expected: false
            }
        ]

        tests.forEach(function(test) {
            it('must return '+test.expected+' given '+test.given, function() {
                assert.strictEqual(util.isAvailableMapHash(test.given, mockMaps), test.expected);
            });
        });
    });

    describe('util.getSelectedMapConfig', function() {

        it('must be defined', function() {
            assert.isDefined(util.getSelectedMapConfig);
        });

        var mockMaps = {
            stalingrad: {
                hash: '#stalingrad',
                selectIndex: 0
            },
            other: {
                hash: '#other',
                selectIndex: 1
            }
        };

        var tests = [
            {
                given: '#stalingrad',
                expected: 'stalingrad'
            },
            {
                given: '#other',
                expected: 'other'
            },
            {
                given: '#none',
                expected: 'stalingrad'
            }
        ]

        tests.forEach(function(test) {
            it('must return '+test.expected+' given '+test.given, function() {
                assert.strictEqual(util.getSelectedMapConfig(test.given, mockMaps), mockMaps[test.expected]);
            });
        });
    });

    describe('util.defaultSpeedArray', function() {

        it('must be defined', function() {
            assert.isDefined(util.defaultSpeedArray);
        });

        var tests = [
            {
                given: {
                    speed: 300,
                    count: 5
                },
                expectedLength: 5
            },
            {
                given: {
                    speed: 300,
                    count: 0
                },
                expectedLength: 0
            }
        ]

        tests.forEach(function(test) {
            it('must return array of length '+test.expectedLength+' given '+test.given.speed+' and '+test.given.count, function() {
                assert.lengthOf(util.defaultSpeedArray(test.given.speed, test.given.count), test.expectedLength);
            });
        });
    });

    describe('util.formatFlightLegMarker', function() {

        it('must be defined', function() {
            assert.isDefined(util.formatFlightLegMarker);
        });

        var expected = '300.0km | 116&deg;/296&deg; <br/> 300kph | ETE 60:00';
        var given = {
            distance: 300,
            heading: 116,
            speed: 300,
            time: '60:00'
        }
 
        it('must return '+expected+' given '+given.distance+', '+given.heading+', '+given.speed+' and '+given.time, function() {
            assert.strictEqual(util.formatFlightLegMarker(given.distance, given.heading, given.speed, given.time, 'metric'), expected);
        });
    });

    describe('util.isLine', function() {

        it('must be defined', function() {
            assert.isDefined(util.isLine);
        });

        var tests = [
            {
                given: {
                    getLatLngs: function(){}
                },
                expected: true
            },
            {
                given: {
                    getLatLng: function(){}
                },
                expected: false
            }
        ]

        tests.forEach(function(test) {
            it('must return '+test.expected+' given '+JSON.stringify(test.given), function() {
                assert.strictEqual(util.isLine(test.given), test.expected);
            });
        });
    });

    describe('util.isMarker', function() {

        it('must be defined', function() {
            assert.isDefined(util.isMarker);
        });

        var tests = [
            {
                given: {
                    getLatLngs: function(){}
                },
                expected: false
            },
            {
                given: {
                    getLatLng: function(){}
                },
                expected: true
            }
        ]

        tests.forEach(function(test) {
            it('must return '+test.expected+' given '+JSON.stringify(test.given), function() {
                assert.strictEqual(util.isMarker(test.given), test.expected);
            });
        });
    });

    describe('util.buildGetXhr', function() {

        it('must be defined', function() {
            assert.isDefined(util.buildGetXhr);
        });
    });

    describe('util.buildSyncGetXhr', function() {

        it('must be defined', function() {
            assert.isDefined(util.buildSyncGetXhr);
        });
    });

    xhrMock.teardown();

});
