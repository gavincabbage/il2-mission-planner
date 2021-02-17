module.exports = (function() {

    const
        SECONDS_IN_HOUR = 3600,
        BORDER = 5,
        MILE_PER_KM = 0.6213712,
        KM_PER_MILE = 1.609344
    ;

    return {

        distance: function(a, b) {
            var dLng = b.lng - a.lng;
            var dLat = b.lat - a.lat;
            return Math.sqrt(dLng * dLng + dLat * dLat);
        },

        geometricDegreesToGeographic: function(degrees) {
            if (degrees < 0) {
                degrees += 360;
            }
            return (450 - degrees) % 360;
        },

        heading: function(a, b) {
            var radians = Math.atan2(b.lat - a.lat, b.lng - a.lng);
            var degrees = radians * 180 / Math.PI;
            degrees = this.geometricDegreesToGeographic(degrees);
            return degrees;
        },

        midpoint: function(a, b) {
            var lat = (a.lat + b.lat) / 2;
            var lng = (a.lng + b.lng) / 2;
            return L.latLng(lat, lng);
        },

        pad: function(num, size) {
            var s = Math.floor(num).toFixed(0);
            while (s.length < size) {
                s = "0" + s;
            }
            return s;
        },

        time: function(speed, distance) {
            var kmPerSecond = speed / SECONDS_IN_HOUR;
            return distance / kmPerSecond;
        },

        maxBounds: function(mapConfig) {
            return [
                [mapConfig.latMin - BORDER, mapConfig.lngMin - BORDER],
                [mapConfig.latMax + BORDER, mapConfig.lngMax + BORDER]
            ];
        },

        center: function(mapConfig) {
            return [mapConfig.latMax / 2, mapConfig.lngMax / 2];
        },

        gridLatLng: function(grid, mapConfig) {
            var width = mapConfig.lngMax - mapConfig.lngMin;
            var height = mapConfig.latMax - mapConfig.latMin;
            var gridWidth = width / mapConfig.lngGridMax;
            var gridHeight = height / mapConfig.latGridMax;
            var gridSideLength = (gridWidth + gridHeight) / 2;
            var gridLat = parseInt(grid.substring(0, 2));
            var gridLng = parseInt(grid.substring(2, 4));
            var lat = mapConfig.latMax - (gridLat*gridSideLength);
            var lng = (gridLng*gridSideLength);
            return [lat, lng];
        },

        invertHeading: function(heading) {
            return (360 + (heading - 180)) % 360;
        },

        convertSpeed: function(value, units) {
            var factor = units === 'metric' ? KM_PER_MILE : MILE_PER_KM;
            return Math.round(value * factor);
        },

        convertDistance: function(value, units) {
            var factor = units === 'metric' ? KM_PER_MILE : MILE_PER_KM;
            return (value * factor).toFixed(1);
        },
    };
})();
