var content = (function() {

    var content = {
        tileServiceUrl: 'http://tiles.il2missionplanner.com/img/{z}/{x}/{y}.png',
        titleText: 'Il-2 Mission Planner',
        helpTooltip: 'How to use this tool',
        clearTooltip: 'Clear the map',
        flightModalTemplate:
            '<div id="flight-modal"> \
                <h2>Configure flight</h2> \
                <form> \
                    <div class="modal-item"> \
                        <label class="modal-item-label" for="flight-name">Flight name</label> \
                        <input id="flight-name" class="modal-item-input" value="{name}" placeholder="name"></input> \
                    </div> \
                    <div class="modal-item"> \
                        <label class="modal-item-label" for="flight-speed">Average speed</label> \
                        <input id="flight-speed" class="modal-item-input" value="{speed}"></input> \
                    </div> \
                    <button class="{okCls}" type="button">{okText}</button> \
                </form> \
            </div>',
        confirmClearTemplate:
            '<div id="confirm-clear-modal"> \
                <h2>Clear the map</h2> \
                <p>Are you sure? This action cannot be undone.</p> \
                <button class="{okCls}">{okText}</button> \
                <button class="{cancelCls}">{cancelText}</button> \
            </div>',
        helpTemplate:
            '<div id="help-modal"> \
                <h2>How to</h2> \
            </div>',
        targetModalTemplate:
            '<div id="target-modal"> \
                <h2>Configure target</h2> \
                <form> \
                    <div class="modal-item"> \
                        <label class="modal-item-label" for="target-name">Target name</label> \
                        <input id="target-name" class="modal-item-input" value="{name}" placeholder="name"></input> \
                    </div> \
                    <div class="modal-item"> \
                        <label class="modal-item-label" for="target-notes">Notes</label> \
                        <textarea id="target-notes" class="modal-item-text" value="{notes}"></textarea> \
                    </div> \
                    <button class="{okCls}" type="button">{okText}</button> \
                </form> \
            </div>'
    };

    //  Just copied this wholesale from Leaflet.draw and edited some
    L.drawLocal = {
        draw: {
    		toolbar: {
    			actions: {
    				title: 'Cancel',
    				text: 'Cancel'
    			},
    			finish: {
    				title: 'Finish',
    				text: 'Finish'
    			},
    			undo: {
    				title: 'Delete last point',
    				text: 'Delete last point'
    			},
    			buttons: {
    				polyline: 'Map a flight',
    				polygon: 'Draw a polygon',
    				rectangle: 'Draw a rectangle',
    				circle: 'Draw a circle',
    				marker: 'Mark a target'
    			}
    		},
    		handlers: {
    			circle: {
    				tooltip: {
    					start: 'Click and drag to draw circle'
    				},
    				radius: 'Radius'
    			},
    			marker: {
    				tooltip: {
    					start: 'Click to mark a target'
    				}
    			},
    			polygon: {
    				tooltip: {
    					start: 'Click to start drawing shape',
    					cont: 'Click to continue drawing shape',
    					end: 'Click first point to close this shape'
    				}
    			},
    			polyline: {
    				error: '<strong>Error:</strong> shape edges cannot cross!',
    				tooltip: {
    					start: 'Click to start a flight plan',
    					cont: 'Click to continue the flight plan',
    					end: 'Click last point to finish flight plan'
    				}
    			},
    			rectangle: {
    				tooltip: {
    					start: 'Click and drag to draw rectangle'
    				}
    			},
    			simpleshape: {
    				tooltip: {
    					end: 'Release mouse to finish drawing'
    				}
    			}
    		}
    	},
    	edit: {
    		toolbar: {
    			actions: {
    				save: {
    					title: 'Save changes',
    					text: 'Save'
    				},
    				cancel: {
    					title: 'Cancel editing, discard all changes',
    					text: 'Cancel'
    				}
    			},
    			buttons: {
    				edit: 'Edit map',
    				editDisabled: 'Nothing to edit',
    				remove: 'Delete items from the map',
    				removeDisabled: 'Nothing to delete'
    			}
    		},
    		handlers: {
    			edit: {
    				tooltip: {
    					text: 'Drag items to edit the map',
    					subtext: null
    				}
    			},
    			remove: {
    				tooltip: {
    					text: 'Click to delete items from the map'
    				}
    			}
    		}
    	}
    };

    return content;

})();
