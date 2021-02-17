(function() {

    'use strict';

    var fs = require('fs');
    var content = require('./content.js');
    var calc = require('./calc.js');
    var util = require('./util.js');
    var icons = require('./icons.js')(L);
    var webdis = require('./webdis.js');
    require('./controls.js');

    var conf = JSON.parse(fs.readFileSync('dist/conf.json', 'utf8'));

    const
        RED = '#9A070B',
        RED_FRONT = '#BD0101',
        BLUE_FRONT = '#4D4B40',
        FLIGHT_OPACITY = 0.8,
        LINE_OPTIONS = {
            color: RED,
            weight: 2,
            opacity: FLIGHT_OPACITY

        }
    ;

    var map, mapTiles, mapConfig, drawnItems, hiddenLayers, frontline,
            drawControl, selectedMapIndex;

    var state = {
        units: window.localStorage.getItem('units') || 'metric',
        colorsInverted: false,
        showBackground: true,
        streaming: false,
        connected: false,
        changing: false,
        streamInfo: {},
        streamingAvailable: webdis.init()
    };

    // Patch a leaflet bug, see https://github.com/bbecquet/Leaflet.PolylineDecorator/issues/17
    L.PolylineDecorator.include(L.Mixin.Events);

    // Patch leaflet content with custom language
    L.drawLocal = content.augmentedLeafletDrawLocal;

    // Initialize form validation
    var V = new Validatinator(content.validatinatorConfig);

    function mapIsEmpty() {
      return drawnItems.getLayers().length === 0 && frontline.getLayers().length === 0;
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
                            fillOpacity: FLIGHT_OPACITY,
                            color: RED
                        }
                    })
                }
            ]
        });
    }

    function applyCustomFlightLeg(marker) {
        if (state.changing || state.connected) {
            return;
        }
        var parentRoute = drawnItems.getLayer(marker.parentId);
        map.openModal({
            speed: parentRoute.speeds[marker.index],
            template: content.flightLegModalTemplate,
            zIndex: 10000,
            onShow: function(e) {
                var element = document.getElementById('flight-leg-speed');
                element.focus();
                element.select();
                L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                    if (V.passes('flight-leg-form')) {
                        var newSpeed = parseInt(element.value);
                        parentRoute.speeds[marker.index] = newSpeed;
                        marker.options.speed = newSpeed;
                        applyCustomFlightLegCallback(marker);
                        e.modal.hide();
                    } else {
                        var errorElement = document.getElementById('flight-leg-error');
                        var units = state.units === 'metric' ? 'kilometers' : 'miles';
                        errorElement.innerHTML = 'Please input a valid speed in' + units + 'per hour.';
                        util.removeClass(errorElement, 'hidden-section');
                        errorElement.focus();
                    }
                });
                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                    e.modal.hide();
                });
            }
        });
    }

    function applyCustomFlightLegCallback(marker) {
        marker.options.time = util.formatTime(calc.time(marker.options.speed, marker.options.distance));
        var newContent = util.formatFlightLegMarker(
                marker.options.distance, 
                marker.options.heading, 
                marker.options.speed, 
                marker.options.time,
                state.units
            );
        marker.setIcon(icons.textIconFactory(newContent, 'flight-leg ' + getMapTextClasses(state)));
        publishMapState();
    }

    function applyFlightPlanCallback(route, newFlight) {
        const routeClickHandlerFactory = function (clickedRoute) {
            return function() {
                if (state.changing || state.connected) {
                    return;
                }
                deleteAssociatedLayers(L.layerGroup([clickedRoute]));
                applyFlightPlan(clickedRoute);
            };
        };
        const markerClickHandlerFactory = function (clickedMarker) {
            return function() {
                if (state.changing || state.connected) {
                    return;
                }
                applyCustomFlightLeg(clickedMarker);
            };
        };
        if (newFlight) {
            route.on('click', routeClickHandlerFactory(route));
        }
        var id = route._leaflet_id;
        var coords = route.getLatLngs();
        var decorator = newFlightDecorator(route);
        decorator.parentId = id;
        decorator.addTo(map);
        if (typeof route.speeds === 'undefined' || route.speedDirty || route.wasEdited) {
            route.speeds = util.defaultSpeedArray(route.speed, coords.length-1);
        }
        for (var i = 0; i < coords.length-1; i++) {
            var distance = mapConfig.scale * calc.distance(coords[i], coords[i+1]);
            var heading = calc.heading(coords[i], coords[i+1]);
            var midpoint = calc.midpoint(coords[i], coords[i+1]);
            var time = util.formatTime(calc.time(route.speeds[i], distance));
            var markerContent = util.formatFlightLegMarker(distance, heading, route.speeds[i], time, state.units);
            var marker =  L.marker(midpoint, {
                distance: distance,
                heading: heading,
                time: time,
                speed: route.speeds[i],
                icon: icons.textIconFactory(markerContent, 'flight-leg ' + getMapTextClasses(state))
            });
            marker.parentId = id;
            marker.index = i;
            marker.on('click', markerClickHandlerFactory(marker));
            marker.addTo(map);
        }
        var endMarker = L.circleMarker(coords[coords.length-1], {
            clickable: false,
            radius: 3,
            color: RED,
            fillColor: RED,
            opacity: FLIGHT_OPACITY,
            fillOpacity: FLIGHT_OPACITY
        });
        endMarker.parentId = id;
        endMarker.addTo(map);
        var nameCoords = L.latLng(coords[0].lat, coords[0].lng);
        var nameMarker = L.marker(nameCoords, {
            draggable: false,
            icon: icons.textIconFactory(route.name, 'map-title flight-titles ' + getMapTextClasses(state))
        });
        nameMarker.parentId = id;
        nameMarker.on('click', routeClickHandlerFactory(route));
        nameMarker.addTo(map);
        publishMapState();
    }

    function applyFlightPlan(route) {
        if (state.changing || state.connected) {
            return;
        }
        var newFlight = false;
        if (typeof route.speed === 'undefined') {
            route.speed = content.default.flightSpeed;
            newFlight = true;
        }
        if (typeof route.name === 'undefined') {
            route.name = content.default.flightName;
        }
        var initialSpeed = route.speed;
        var clickedOk = false;
        map.openModal({
            speed: route.speed,
            name: route.name,
            template: content.flightModalTemplate,
            zIndex: 10000,
            onShow: function(e) {
                var element = document.getElementById('flight-name');
                element.focus();
                element.select();
                L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                    clickedOk = true;
                    e.modal.hide();
                });
                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                    e.modal.hide();
                });
            },
            onHide: function(e) {
                if (clickedOk) {
                    route.name = document.getElementById('flight-name').value;
                    route.speed = parseInt(document.getElementById('flight-speed').value);
                    route.speedDirty = (route.speed !== initialSpeed);
                    applyFlightPlanCallback(route, newFlight);
                } else if (newFlight) {
                    drawnItems.removeLayer(route);
                } else {
                    applyFlightPlanCallback(route, newFlight);
                }
                checkButtonsDisabled();
            }
        });
    }

    function applyTargetInfoCallback(target, newTarget) {
        function targetClickHandlerFactory(clickedTarget) {
            return function() {
                if (state.changing || state.connected) {
                    return;
                }
                deleteAssociatedLayers(L.layerGroup([clickedTarget]));
                applyTargetInfo(clickedTarget);
            };
        }
        var id = target._leaflet_id;
        var coords = target.getLatLng();
        target.setIcon(icons.factory(target.type, target.color));
        if (newTarget) {
            target.on('click', targetClickHandlerFactory(target));
        }
        var nameCoords = L.latLng(coords.lat, coords.lng);
        var nameMarker = L.marker(nameCoords, {
            draggable: false,
            icon: icons.textIconFactory(target.name, 'map-title target-title ' + getMapTextClasses(state))
        });
        nameMarker.parentId = id;
        nameMarker.on('click', targetClickHandlerFactory(target));
        nameMarker.addTo(map);
        if (target.notes !== '') {
            target.bindLabel(target.notes, {
                direction: 'left'
            }).addTo(map);
        }
        publishMapState();
    }

    function applyTargetInfo(target) {
        if (state.changing || state.connected) {
            return;
        }
        var newTarget = false;
        if (typeof target.name === 'undefined') {
            target.name = content.default.pointName;
            var newTarget = true;
        }
        if (typeof target.notes === 'undefined') {
            target.notes = '';
        }
        if (typeof target.type === 'undefined') {
            target.type = content.default.pointType;
        }
        if (typeof target.color === 'undefined') {
            target.color = content.default.pointColor;
        }
        var clickedOk = false;
        map.openModal({
            name: target.name,
            notes: target.notes,
            template: content.pointModalTemplate,
            zIndex: 10000,
            onShow: function(e) {
                var element = document.getElementById('target-name');
                element.focus();
                element.select();
                var typeSelect = document.getElementById('point-type-select');
                typeSelect.value = target.type;
                var colorSelect = document.getElementById('point-color-select');
                colorSelect.value = target.color;
                L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                    clickedOk = true;
                    e.modal.hide();
                });
                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                    e.modal.hide();
                });
            },
            onHide: function(e) {
                if (clickedOk) {
                    target.name = document.getElementById('target-name').value;
                    target.notes = document.getElementById('target-notes').value;
                    target.type = document.getElementById('point-type-select').value;
                    target.color = document.getElementById('point-color-select').value;
                    applyTargetInfoCallback(target, newTarget);
                } else if (newTarget) {
                    drawnItems.removeLayer(target);
                } else {
                    applyTargetInfoCallback(target, newTarget);
                }
                checkButtonsDisabled();
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

    function transferChildLayers(from, to) {
        from.eachLayer(function(layer) {
            if (typeof layer.parentId !== 'undefined') {
                from.removeLayer(layer);
                to.addLayer(layer);
            }
        });
    }

    function showChildLayers() {
        transferChildLayers(hiddenLayers, map);
    }

    function hideChildLayers() {
        transferChildLayers(map, hiddenLayers);
    }

    function changeUnits(units) {
        state.units = units;
        window.localStorage.setItem('units', units);
        var parentChanged = false;
        map.eachLayer(function (layer) {
            if (layer.options && layer.options.speed) {
                if (!parentChanged) {
                    var parentRoute = drawnItems.getLayer(layer.parentId);
                    parentRoute.speeds = parentRoute.speeds.map((speed) => calc.convertSpeed(speed, units));
                    parentChanged = true;
                }
                layer.options.speed = calc.convertSpeed(layer.options.speed, units);
                layer.options.distance = calc.convertDistance(layer.options.distance, units);
                applyCustomFlightLegCallback(layer);
            }
        });
    }

    function disableButtons(buttonList) {
        for (var i = 0; i < buttonList.length; i++) {
            var element = document.getElementById(buttonList[i]);
            element.classList.add('leaflet-disabled');
        }
    }

    function enableButtons(buttonList) {
        for (var i = 0; i < buttonList.length; i++) {
            var element = document.getElementById(buttonList[i]);
            element.classList.remove('leaflet-disabled');
        }
    }

    function checkButtonsDisabled() {
        var buttons = ['export-button', 'missionhop-button'];
        if (!state.connected) {
            buttons.push('clear-button');
        }
        if (mapIsEmpty()) {
            disableButtons(buttons);
        } else {
            enableButtons(buttons);
        }
    }

    function clearMap() {
        drawnItems.clearLayers();
        frontline.clearLayers();
        hideChildLayers();
        hiddenLayers.clearLayers();
        publishMapState();
    }

    function exportMapState() {
        var saveData = {
            mapHash: window.location.hash,
            units: state.units,
            routes: [],
            points: []
        };
        drawnItems.eachLayer(function(layer) {
            var saveLayer = {};
            if (util.isLine(layer)) {
                saveLayer.latLngs = layer.getLatLngs();
                saveLayer.name = layer.name;
                saveLayer.speed = layer.speed;
                saveLayer.speeds = layer.speeds;
                saveData.routes.push(saveLayer);
            } else if (util.isMarker(layer)) {
                saveLayer.latLng = layer.getLatLng();
                saveLayer.name = layer.name;
                saveLayer.type = layer.type;
                saveLayer.color = layer.color;
                saveLayer.notes = layer.notes;
                saveData.points.push(saveLayer);
            }
        });
        return saveData;
    }

    function selectMap(selectedMapConfig) {
        var newIndex = selectedMapConfig.selectIndex;
        if (newIndex !== selectedMapIndex) {
            selectedMapIndex = selectedMapConfig.selectIndex;
            window.location.hash = selectedMapConfig.hash;
            deleteAssociatedLayers(drawnItems);
            drawnItems.clearLayers();
            hiddenLayers.clearLayers();
            map.removeLayer(mapTiles);
            mapTiles = L.tileLayer(selectedMapConfig.tileUrl, {
                minZoom: selectedMapConfig.minZoom,
                maxZoom: selectedMapConfig.maxZoom,
                noWrap: true,
                tms: true,
                continuousWorld: true
            }).addTo(map);
            map.setMaxBounds(calc.maxBounds(selectedMapConfig));
            map.setView(calc.center(selectedMapConfig), selectedMapConfig.defaultZoom);
        }
    }

    function fitViewToMission() {
        map.fitBounds(drawnItems.getBounds());
    }

    function getMapTextClasses(state) {
        var classes = 'map-text';
        if (state.colorsInverted) {
            classes += ' inverted';
        }
        if (!state.showBackground) {
            classes += ' nobg';
        }
        return classes;
    }

    function importMapState(saveData) {
        clearMap();
        var importedMapConfig = util.getSelectedMapConfig(saveData.mapHash, content.maps);
        selectMap(importedMapConfig);
        mapConfig = importedMapConfig;
        selectedMapIndex = mapConfig.selectIndex;
        state.units = saveData.units || 'imperial';
        if (saveData.routes) {
            for (var i = 0; i < saveData.routes.length; i++) {
                var route = saveData.routes[i];
                var newRoute = L.polyline(route.latLngs, LINE_OPTIONS);
                newRoute.name = route.name;
                newRoute.speed = route.speed;
                newRoute.speeds = route.speeds;
                drawnItems.addLayer(newRoute);
                applyFlightPlanCallback(newRoute);
            }
        }
        if (saveData.points) {
            for (var i = 0; i < saveData.points.length; i++) {
                var point = saveData.points[i];
                var newPoint = L.marker(point.latLng, {
                    icon: icons.factory(point.type, point.color)
                });
                newPoint.name = point.name;
                newPoint.type = point.type;
                newPoint.color = point.color;
                newPoint.notes = point.notes;
                drawnItems.addLayer(newPoint);
                applyTargetInfoCallback(newPoint);
            }
        }
        if (saveData.frontline) {
            for (var frontNdx = 0; frontNdx < saveData.frontline.length; frontNdx++) { // for each frontline
                var blueFront = saveData.frontline[frontNdx][0];
                var redFront = saveData.frontline[frontNdx][1];
                L.polyline(blueFront, {color: BLUE_FRONT, opacity: 1}).addTo(frontline);
                L.polyline(redFront, {color: RED_FRONT, opacity: 1}).addTo(frontline);
            }

        }
    }

    function publishMapState() {
        if (state.streaming) {
            var saveData = exportMapState();
            webdis.publish(state.streamInfo.name, state.streamInfo.password,
                    state.streamInfo.code, window.escape(JSON.stringify(saveData)));
        }
    }

    function startConnectedMode() {
        map.removeControl(drawControl);
        map.removeControl(clearButton);
    }

    function endConnectedMode() {
        map.removeControl(gridToolbar);
        map.removeControl(importExportToolbar);
        map.addControl(drawControl);
        map.addControl(gridToolbar);
        map.addControl(clearButton);
        map.addControl(importExportToolbar);
        checkButtonsDisabled();
    }

    function setupCheckboxTogglableElement(checkboxId, elementId) {
        var checkbox = document.getElementById(checkboxId);
        var element = document.getElementById(elementId);
        L.DomEvent.on(checkbox, 'click', function() {
            if (checkbox.checked) {
                util.removeClass(element, 'hidden-section');

            } else {
                util.addClass(element, 'hidden-section');
            }
        });
    }

    // if hash is not in map list, try to get json for that server
    if (window.location.hash !== '' && !util.isAvailableMapHash(window.location.hash, content.maps)) {
        var responseBody = null;
        var url = conf.apiUrl + '/servers/' + window.location.hash.substr(1);
        var xhr = util.buildGetXhr(url, function() {
            if (xhr.readyState === 4) {
                responseBody = JSON.parse(xhr.responseText);
                importMapState(responseBody.data);
                fitViewToMission();
                checkButtonsDisabled();
            }
        });
    }

    mapConfig = util.getSelectedMapConfig(window.location.hash , content.maps);
    selectedMapIndex = mapConfig.selectIndex;

    map = L.map('map', {
        crs: L.CRS.Simple,
        attributionControl: false
    });

    mapTiles = L.tileLayer(mapConfig.tileUrl, {
        minZoom: mapConfig.minZoom,
        maxZoom: mapConfig.maxZoom,
        noWrap: true,
        tms: true,
        continuousWorld: true
    }).addTo(map);

    map.setView(calc.center(mapConfig), mapConfig.defaultZoom);
    map.setMaxBounds(calc.maxBounds(mapConfig));

    drawnItems = L.featureGroup();
    map.addLayer(drawnItems);
    frontline = L.featureGroup();
    map.addLayer(frontline);
    hiddenLayers = L.featureGroup();

    drawControl = new L.Control.Draw({
        draw: {
            polygon: false,
            rectangle: false,
            circle: false,
            polyline: {
                showLength: false,
                shapeOptions: LINE_OPTIONS
            },
            marker: {
                icon: icons.factory(content.default.pointType, content.default.pointColor)
            }
        },
        edit: {
            featureGroup: drawnItems,
            edit: L.Browser.touch ? false : {
                selectedPathOptions: {
                    maintainColor: true,
                    opacity: 0.4,
                    fill: false
                }
            }
        }
    });
    map.addControl(drawControl);

    var titleControl = new L.Control.TitleControl({});
    map.addControl(titleControl);

    var clearButton = new L.Control.CustomToolbar({
        position: 'bottomleft',
        buttons: [
            {
                id: 'clear-button',
                icon: 'fa-trash',
                tooltip: content.clearTooltip,
                clickFn: function() {
                    if (!mapIsEmpty()) {
                        map.openModal({
                            template: content.confirmClearModalTemplate,
                            onShow: function(e) {
                                var element = document.getElementById('confirm-cancel-button');
                                element.focus();
                                L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                                    clearMap();
                                    e.modal.hide();
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            },
                            onHide: function() {
                                checkButtonsDisabled();
                            }
                        });
                    }
                }
            }
        ]
    });
    map.addControl(clearButton);

    var helpSettingsToolbar = new L.Control.CustomToolbar({
        position: 'bottomright',
        buttons: [
            {
                id: 'settings-button',
                icon: 'fa-gear',
                tooltip: content.settingsTooltip,
                clickFn: function() {
                    map.openModal({
                        template: content.settingsModalTemplate,
                        onShow: function(e) {
                            var mapSelect = document.getElementById('map-select');
                            mapSelect.selectedIndex = selectedMapIndex;
                            var originalIndex = selectedMapIndex;

                            var invertCheckbox = document.getElementById('invert-text-checkbox');
                            invertCheckbox.checked = state.colorsInverted;

                            var unitsSelect = document.getElementById('units-select');
                            var originalUnitValue = state.units;
                            unitsSelect.value = originalUnitValue;

                            var backgroundCheckbox = document.getElementById('text-background-checkbox');
                            backgroundCheckbox.checked = state.showBackground;
                            mapSelect.focus();

                            L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                                if (mapSelect.selectedIndex !== originalIndex) {
                                    var selectedMap = mapSelect.options[mapSelect.selectedIndex].value;
                                    mapConfig = content.maps[selectedMap];
                                    selectMap(mapConfig);
                                    selectedMapIndex = mapSelect.selectedIndex;
                                    publishMapState();
                                }
                                if (unitsSelect.value !== originalUnitValue) {
                                    changeUnits(unitsSelect.value);
                                }

                                if (invertCheckbox.checked !== state.colorsInverted) {
                                    state.colorsInverted = invertCheckbox.checked;
                                    var textElements = document.getElementsByClassName('map-text');
                                    for (var i = 0; i < textElements.length; i++) {
                                        if (state.colorsInverted) {
                                            textElements[i].classList.add('inverted');
                                        } else {
                                            textElements[i].classList.remove('inverted');
                                        }
                                    }
                                }
                                if (backgroundCheckbox.checked !== state.showBackground) {
                                    state.showBackground = backgroundCheckbox.checked;
                                    var textElements = document.getElementsByClassName('map-text');
                                    for (var i = 0; i < textElements.length; i++) {
                                        if (state.showBackground) {
                                            textElements[i].classList.remove('nobg');
                                        } else {
                                            textElements[i].classList.add('nobg');
                                        }
                                    }
                                }
                                e.modal.hide();
                            });
                            L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                e.modal.hide();
                            });
                        }
                    });
                }
            },
            {
                id: 'help-button',
                icon: 'fa-question',
                tooltip: content.helpTooltip,
                clickFn: function() {
                    map.openModal({
                        template: content.helpModalTemplate,
                        onShow: function(e) {
                            L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                                e.modal.hide();
                            });
                        }
                    });
                }
            }
        ]
    });
    map.addControl(helpSettingsToolbar);

    var importExportToolbar = new L.Control.CustomToolbar({
        position: 'bottomleft',
        buttons: [
            {
                id: 'import-button',
                icon: 'fa-upload',
                tooltip: content.importTooltip,
                clickFn: function() {
                    map.openModal({
                        template: content.importModalTemplate,
                        onShow: function(e) {
                            var importInput = document.getElementById('import-file');
                            importInput.focus();
                            var fileContent;
                            L.DomEvent.on(importInput, 'change', function(evt) {
                                var reader = new window.FileReader();
                                reader.onload = function(evt) {
                                    if(evt.target.readyState !== 2) {
                                        return;
                                    }
                                    if(evt.target.error) {
                                        window.alert('Error while reading file');
                                        return;
                                    }
                                    fileContent = evt.target.result;
                                };
                                reader.readAsText(evt.target.files[0]);
                            });
                            L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                                var saveData = JSON.parse(fileContent);
                                importMapState(saveData);
                                e.modal.hide();
                                fitViewToMission();
                            });
                            L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                e.modal.hide();
                            });
                        },
                        onHide: function() {
                            checkButtonsDisabled();
                        }
                    });
                }
            },
            {
                id: 'export-button',
                icon: 'fa-download',
                tooltip: content.exportTooltip,
                clickFn: function() {
                    if (!mapIsEmpty()) {
                        util.download('plan.json', JSON.stringify(exportMapState()));
                    }
                }
            },
            {
                id: 'stream-button',
                icon: 'fa-share-alt',
                tooltip: content.streamTooltip,
                clickFn: function() {
                    var template;
                    if (!state.streaming && !state.connected) {
                        template = content.streamModalTemplate;
                        fireStreamModal();
                    } else if (state.streaming && !state.connected) {
                        template = content.alreadyStreamingModalTemplate;
                        fireAlreadyStreamingModal();
                    } else if (!state.streaming && state.connected) {
                        template = content.alreadyConnectedModalTemplate;
                        fireAlreadyConnectedModal();
                    }
                    function fireStreamModal() {
                        map.openModal({
                            template: template,
                            onShow: function(e) {
                                document.getElementById('stream-start-button').focus();
                                L.DomEvent.on(document.getElementById('stream-start-button'), 'click', function() {
                                    e.modal.hide();
                                    fireStartModal();
                                });
                                L.DomEvent.on(document.getElementById('stream-connect-button'), 'click', function() {
                                    e.modal.hide();
                                    fireConnectModal();
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            }
                        });
                    }
                    function fireStartModal() {
                        map.openModal({
                            template: content.startStreamModalTemplate,
                            onShow: function(e) {
                                document.getElementById('stream-start-confirm-button').focus();
                                L.DomEvent.on(document.getElementById('stream-start-confirm-button'), 'click', function() {
                                    var streamName = document.getElementById('stream-name').value;
                                    var streamPassword = document.getElementById('stream-password').value;
                                    var streamCode = document.getElementById('stream-leader-code').value;
                                    if (!streamName || !streamPassword || !streamCode) {
                                        var errorElement = document.getElementById('start-stream-error');
                                        errorElement.innerHTML = 'All fields are required. Try again.';
                                        util.removeClass(errorElement, 'hidden-section');
                                        return;
                                    }
                                    var mapState = window.escape(JSON.stringify(exportMapState()));
                                    var response = webdis.startStream(streamName, streamPassword, streamCode, mapState);
                                    if (response[0] !== 'SUCCESS')  {
                                        var errorElement = document.getElementById('start-stream-error');
                                        errorElement.innerHTML = response[1];
                                        util.removeClass(errorElement, 'hidden-section');
                                        return;
                                    }
                                    state.streaming = true;
                                    util.addClass(document.querySelector('a.fa-share-alt'), 'streaming');
                                    state.streamInfo = {
                                        name: streamName,
                                        password: streamPassword,
                                        code: streamCode
                                    };
                                    e.modal.hide();
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            }
                        });
                    }
                    function fireConnectModal() {
                        map.openModal({
                            template: content.connectStreamModalTemplate,
                            onShow: function(e) {
                                var streamSelect = document.getElementById('stream-select');
                                var streams = webdis.getStreamList();
                                streamSelect.options.length = 0;
                                for (var i=0; i < streams.length; i++) {
                                    streamSelect.options[i] = new Option(streams[i].substring(7), streams[i].substring(7));
                                }
                                setupCheckboxTogglableElement('leader-checkbox', 'leader-hidden');
                                document.getElementById('stream-connect-button').focus();
                                L.DomEvent.on(document.getElementById('stream-connect-button'), 'click', function() {
                                    var selectedStream = streamSelect.options[streamSelect.selectedIndex].value;
                                    var password = document.getElementById('stream-password').value;
                                    var code, response;
                                    var checkbox = document.getElementById('leader-checkbox');
                                    if (checkbox.checked) {
                                        if (V.fails('connect-form')) {
                                            var errorElement = document.getElementById('connect-stream-error');
                                            errorElement.innerHTML = 'Password and code are required to connect.';
                                            util.removeClass(errorElement, 'hidden-section');
                                            return;
                                        }
                                        code = document.getElementById('stream-code').value;
                                        response = webdis.getStreamReconnect(selectedStream, password, code);
                                        if (response[0] !== 'SUCCESS') {
                                            var errorElement = document.getElementById('connect-stream-error');
                                            errorElement.innerHTML = response[1];
                                            util.removeClass(errorElement, 'hidden-section');
                                            return;
                                        }
                                        state.streamInfo.code = code;
                                        clearMap();
                                        importMapState(JSON.parse(response[2]));
                                        state.streaming = true;
                                        util.addClass(document.querySelector('a.fa-share-alt'), 'streaming');
                                    } else {
                                        if (V.fails('connect-form')) {
                                            var errorElement = document.getElementById('connect-stream-error');
                                            errorElement.innerHTML = 'Password is required to connect.';
                                            util.removeClass(errorElement, 'hidden-section');
                                            return;
                                        }
                                        response = webdis.getStreamInfo(selectedStream, password);
                                        if (response[0] !== 'SUCCESS') {
                                            var errorElement = document.getElementById('connect-stream-error');
                                            errorElement.innerHTML = response[1];
                                            util.removeClass(errorElement, 'hidden-section');
                                            return;
                                        }
                                        webdis.subscribe(response[1]);
                                        clearMap();
                                        importMapState(JSON.parse(response[2]));
                                        state.connected = response[1];
                                        util.addClass(document.querySelector('a.fa-share-alt'), 'connected');
                                        startConnectedMode();
                                    }
                                    state.streamInfo = {
                                        name: selectedStream,
                                        password: password,
                                        code: code
                                    };
                                    checkButtonsDisabled();
                                    e.modal.hide();
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            }
                        });
                    }
                    function fireAlreadyConnectedModal() {
                        map.openModal({
                            streamName: state.streamInfo.name,
                            template: content.alreadyConnectedModalTemplate,
                            onShow: function(e) {
                                document.getElementById('disconnect-button').focus();
                                L.DomEvent.on(document.getElementById('disconnect-button'), 'click', function() {
                                    webdis.unsubscribe(state.connected);
                                    state.connected = false;
                                    util.removeClass(document.querySelector('a.fa-share-alt'), 'connected');
                                    endConnectedMode();
                                    e.modal.hide();
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            }
                        });
                    }
                    function fireAlreadyStreamingModal() {
                        map.openModal({
                            streamName: state.streamInfo.name,
                            streamPassword: state.streamInfo.password,
                            streamCode: state.streamInfo.code,
                            template: content.alreadyStreamingModalTemplate,
                            onShow: function(e) {
                                document.getElementById('stop-streaming-button').focus();
                                setupCheckboxTogglableElement('already-streaming-checkbox', 'already-streaming-hidden');
                                L.DomEvent.on(document.getElementById('stop-streaming-button'), 'click', function() {
                                    e.modal.hide();
                                    state.streaming = false;
                                    util.removeClass(document.querySelector('a.fa-share-alt'), 'streaming');
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            }
                        });
                    }
                }
            }
        ]
    });
    map.addControl(importExportToolbar);

    var gridToolbar = new L.Control.CustomToolbar({
        position: 'topleft',
        buttons: [
            {
                id: 'gridhop-button',
                icon: 'fa-th-large',
                tooltip: content.gridHopTooltip,
                clickFn: function() {
                    map.openModal({
                        template: content.gridJumpModalTemplate,
                        onShow: function(e) {
                            var gridElement = document.getElementById('grid-input');
                            gridElement.focus();
                            L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                                if (V.passes('grid-jump-form')) {
                                    var grid = gridElement.value;
                                    var viewLatLng = calc.gridLatLng(grid, mapConfig);
                                    map.setView(viewLatLng, mapConfig.gridHopZoom);
                                    e.modal.hide();
                                } else {
                                    var errorElement = document.getElementById('grid-jump-error');
                                    errorElement.innerHTML = 'Please input a valid four digit grid number.';
                                    util.removeClass(errorElement, 'hidden-section');
                                    errorElement.focus();
                                }
                            });
                            L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                e.modal.hide();
                            });
                        }
                    });
                }
            },
            {
                id: 'missionhop-button',
                icon: 'fa-crop',
                tooltip: content.missionHopTooltip,
                clickFn: function() {
                    if (!mapIsEmpty()) {
                        fitViewToMission();
                    }
                }
            }
        ]
    });
    map.addControl(gridToolbar);

    map.on('draw:created', function(e) {
        drawnItems.addLayer(e.layer);
        if (e.layerType === 'polyline') {
            applyFlightPlan(e.layer);
        } else if (e.layerType === 'marker') {
            applyTargetInfo(e.layer);
        }
        checkButtonsDisabled();
    });

    map.on('draw:deleted', function(e) {
        deleteAssociatedLayers(e.layers);
        publishMapState();
        checkButtonsDisabled();
    });

    map.on('draw:edited', function(e) {
        deleteAssociatedLayers(e.layers);
        e.layers.eachLayer(function(layer) {
            if (util.isLine(layer)) {
                layer.wasEdited = (layer.getLatLngs().length-1 !== layer.speeds.length);
                applyFlightPlanCallback(layer);
            } else if (util.isMarker(layer)) {
                applyTargetInfoCallback(layer);
            }
        });
        publishMapState();
    });

    map.on('draw:editstart', function() {
        state.changing = true;
        hideChildLayers();
    });

    map.on('draw:editstop', function() {
        state.changing = false;
        showChildLayers();
        checkButtonsDisabled();
    });

    map.on('draw:deletestart', function() {
        state.changing = true;
        hideChildLayers();
    });

    map.on('draw:deletestop', function() {
        state.changing = false;
        showChildLayers();
        checkButtonsDisabled();
    });

    window.addEventListener('il2:streamerror', function (e) {
        if (!state.connected) {
            return;
        }
        util.addClass(document.querySelector('a.fa-share-alt'), 'stream-error');
    });

    window.addEventListener('il2:streamupdate', function (e) {
        if (!state.connected) {
            return;
        }
        var saveData = e.detail;
        if (saveData !== 1) {
            clearMap();
            importMapState(JSON.parse(saveData));
        }
        util.removeClass(document.querySelector('a.fa-share-alt'), 'stream-error');
        checkButtonsDisabled();
    });

    checkButtonsDisabled();

})();
