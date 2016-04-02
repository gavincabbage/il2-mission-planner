(function(content) {

    const
        SCALE_FACTOR = 1.40056,
        LAT_MIN = 0,
        LAT_MAX = 164,
        LNG_MIN = 0,
        LNG_MAX = 252,
        BORDER = 5,
        CENTER = [LAT_MAX / 2, LNG_MAX / 2],
        RED = '#ff0000',
        DEFAULT_SPEED = 300,
        DEFAULT_ALTITUDE = 1000
    ;

    var map, drawnItems, hiddenLayers;

    // patch a leaflet bug, see https://github.com/bbecquet/Leaflet.PolylineDecorator/issues/17
    L.PolylineDecorator.include(L.Mixin.Events);

    function calculateDistance(a, b) {
		var dx = b.lng - a.lng;
        var dy = b.lat - a.lat;
        return SCALE_FACTOR * Math.sqrt(dx * dx + dy * dy);
	}

    function mathDegreesToGeographic(degrees) {
        if (degrees < 0) {
            degrees += 360;
        }
        return (450 - degrees) % 360;
    }

    function calculateHeading(start, end) {
        var radians = Math.atan2(end.lat - start.lat, end.lng - start.lng);
        var degrees = radians * 180 / Math.PI;
        degrees = mathDegreesToGeographic(degrees);
        return degrees;
    }

    function newFlightDecorator(route) {
        return L.polylineDecorator(route, {
            patterns: [
                {
                    offset: 6,
                    repeat: 300,
                    symbol: L.Symbol.arrowHead({
                        pathOptions: {
                            opacity: 0,
                            fillOpacity: 1,
                            color: RED
                        }
                    })
                }
            ]
        });
    }

    function calculateMidpoint(a, b) {
        var lat = (a.lat + b.lat) / 2;
        var lng = (a.lng + b.lng) / 2;
        return L.latLng(lat, lng);
    }

    function pad(num, size) {
        var s = num.toFixed(0);
        while (s.length < size) {
            s = "0" + s;
        }
        return s;
    }

    function calculateTime(speed, distance) {
        var kmPerSecond = speed / 3600;
        return distance / kmPerSecond;
    }

    function formatTime(totalSeconds) {
        var minutes = totalSeconds / 60;
        var seconds = totalSeconds % 60;
        return minutes.toFixed(0) + ':' + pad(seconds, 2);
    }

    function applyFlightPlanCallback(route) {
        console.log(route);
        var id = route._leaflet_id;
        var coords = route.getLatLngs();
        var decorator = newFlightDecorator(route);
        decorator.parentId = id;
        decorator.addTo(map);
        for (var i = 0; i < coords.length-1; i++) {
            var distance = calculateDistance(coords[i], coords[i+1]);
            var heading = calculateHeading(coords[i], coords[i+1]);
            var midpoint = calculateMidpoint(coords[i], coords[i+1]);
            var time = formatTime(calculateTime(route.speed, distance));
            var markerContent = '[' + distance.toFixed(1) + 'km|' + heading.toFixed(0) + '&deg;|' + time + ']';
            var marker =  L.marker(midpoint, {
                clickable: false,
                icon: L.divIcon({
                    className: 'flight-leg',
                    html: markerContent,
                    iconSize: [250, 0]
                })
            });
            marker.parentId = id;
            marker.addTo(map);
        }
        var endMarker = L.circleMarker(coords[coords.length-1], {
            clickable: false,
            radius: 3,
            color: RED,
            fillColor: RED,
            opacity: 1,
            fillOpacity: 1
        });
        endMarker.parentId = id;
        endMarker.addTo(map);
        var nameCoords = L.latLng(coords[0].lat, coords[0].lng);
        var nameMarker = L.marker(nameCoords, {
            clickable: false,
            icon: L.divIcon({
                className: 'flight-title',
                html: route.name,
                iconSize: [250,0]
            })
        });
        nameMarker.parentId = id;
        nameMarker.addTo(map);
    }

    function applyFlightPlan(route) {
        if (typeof route.speed === 'undefined') {
            route.speed = DEFAULT_SPEED;
        }
        if (typeof route.name === 'undefined') {
            route.name = '';
        }
        map.fire('modal', {
            speed: route.speed,
            name: route.name,
            template: content.flightModalTemplate,
            zIndex: 10000,
            onShow: function(e) {
                e.modal.route = route;
            },
            onHide: function(e) {
                e.modal.route.name = document.getElementById('flight-name').value;
                e.modal.route.speed = document.getElementById('flight-speed').value;
                applyFlightPlanCallback(e.modal.route);
            }
        });
    }

    function deleteAssociatedLayers(parentLayers) {
        var toDelete = [];
        parentLayers.eachLayer(function(layer) {
            toDelete.push(layer._leaflet_id);
        });

        map.eachLayer(function(layer) {
            if (toDelete.indexOf(layer.parentId) !== -1) {
                map.removeLayer(layer);
            }
        });
        hiddenLayers.eachLayer(function(layer) {
            if (toDelete.indexOf(layer.parentId) !== -1) {
                hiddenLayers.removeLayer(layer);
            }
        });
    }

    function transferChildLayer(from, to) {
        from.eachLayer(function(layer) {
            if (typeof layer.parentId !== 'undefined') {
                from.removeLayer(layer);
                to.addLayer(layer);
            }
        });
    }

    function showChildLayers() {
        transferChildLayer(hiddenLayers, map);
    }

    function hideChildLayers() {
        transferChildLayer(map, hiddenLayers);
    }

    function checkClearButtonDisabled() {
        var element = document.getElementById('clear-button');
        if (drawnItems.getLayers().length === 0) {
            element.classList.add('leaflet-disabled');
        } else {
            element.classList.remove('leaflet-disabled');
        }
    }

    map = L.map('map', {
        crs: L.CRS.Simple,
        attributionControl: false
    }).setView(CENTER, 3);

    L.tileLayer(content.tileServiceUrl, {
        minZoom: 2,
        maxZoom: 6,
        noWrap: true,
        tms: true,
        continuousWorld: true
    }).addTo(map);

    map.setMaxBounds(new L.LatLngBounds(
        [LAT_MIN - BORDER, LNG_MIN - BORDER],
        [LAT_MAX + BORDER, LNG_MAX + BORDER]
    ));

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    hiddenLayers = new L.FeatureGroup();

    var editOptions = {
        selectedPathOptions: {
            maintainColor: true,
            opacity: 0.5
        }
    };
    var drawControl = new L.Control.Draw({
        draw: {
            polygon: false,
            rectangle: false,
            circle: false,
            polyline: {
                showLength: false,
                shapeOptions: {
                    color: RED,
                    weight: 2,
                    opacity: 1
                }
            }
        },
        edit: {
            featureGroup: drawnItems,
            edit: L.Browser.touch ? false : editOptions
        }
    });
    map.addControl(drawControl);

    var titleControl = new L.Control.TitleControl({});
    map.addControl(titleControl);

    var clearButton = new L.Control.CustomButton({}, 'clear-button', 'fa-trash', function() {
        if (drawnItems.getLayers().length !== 0) {
            map.openModal({
                template: content.confirmClearTemplate,
                okCls: 'modal-ok',
                okText: 'Yes',
                cancelCls: 'modal-cancel',
                cancelText: 'No',
                onShow: function(e) {
                    L.DomEvent
                        .on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                            drawnItems.clearLayers();
                            hideChildLayers();
                            hiddenLayers.clearLayers();
                            e.modal.hide();
                            checkClearButtonDisabled();
                        })
                        .on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                            e.modal.hide();
                        });
                }
            });
        }
    });
    map.addControl(clearButton);

    map.on('draw:created', function(e) {
        map.addLayer(e.layer);
        drawnItems.addLayer(e.layer);
        if (e.layerType === 'polyline') {
            applyFlightPlan(e.layer);
        }
        checkClearButtonDisabled();
    });

    map.on('draw:deleted', function(e) {
        deleteAssociatedLayers(e.layers);
        checkClearButtonDisabled();
    });

    map.on('draw:edited', function(e) {
        deleteAssociatedLayers(e.layers);
        e.layers.eachLayer(function(layer) {
            if (typeof layer.getLatLngs !== 'undefined') {
                applyFlightPlanCallback(layer);
            }
        });
    });

    map.on('draw:editstart', function() {
        hideChildLayers();
    });

    map.on('draw:editstop', function() {
        showChildLayers();
    });

    map.on('draw:deletestart', function() {
        hideChildLayers();
    });

    map.on('draw:deletestop', function() {
        showChildLayers();
    });

})(content);
