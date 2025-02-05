//
//   Project Horus - Browser-Based Chase Mapper - Bearing Handlers
//
//   Copyright (C) 2019  Mark Jessop <vk5qi@rfhead.net>
//   Released under GNU GPL v3 or later
//
//
//	 TODO:
//		[x] Update bearing settings on change of fields
//		[ ] Check what's up with the opacity scaling (make it properly linear)
//		[ ] Load in default values from config file on startup
//		[ ] Add compass widget to map to show latest bearing data.
//
//

var bearing_store = {};

var bearings_on = true;
var bearings_only_mode = false;


var bearing_confidence_threshold = 50.0;
var bearing_max_age = 20*60.0;

var bearing_length = 10000;
var bearing_weight = 0.5;
var bearing_color = "#000000";
var bearing_max_opacity = 0.8;
var bearing_min_opacity = 0.1;

var bearing_large_plot = false;

// Store for the latest server timestamp.
// Start out with just our own local timestamp.
var latest_server_timestamp = Date.now()/1000.0;


function updateBearingSettings(){
	// Update bearing settings, but do *not* redraw.
	bearing_weight = parseFloat($('#bearingWeight').val());
	bearing_length = parseFloat($('#bearingLength').val())*1000;
	bearing_confidence_threshold = parseFloat($('#bearingConfidenceThreshold').val());
	bearing_max_age = parseFloat($('#bearingMaximumAge').val())*60.0;
	bearing_min_opacity = parseFloat($('#bearingMinOpacity').val());
	bearing_max_opacity = parseFloat($('#bearingMaxOpacity').val());
	var _bearing_color = $('#bearingColorSelect').val();
	var _bearing_custom_color = $('#bearingCustomColor').val();

	if(_bearing_color == "red"){
		bearing_color = "#FF0000";
	} else if (_bearing_color == "black"){
		bearing_color = "#000000";
	} else if (_bearing_color == "blue"){
		bearing_color = "#0000FF";
	} else if (_bearing_color == "green"){
		bearing_color = "#00AA00";
	} else if (_bearing_color == "white"){
		bearing_color = "#FFFFFF";
	} else if (_bearing_color == "custom"){
		bearing_color = _bearing_custom_color;
	}
}

function destroyAllBearings(){
	$.each(bearing_store, function(key, value) {
		bearing_store[key].line.remove();
	});

	bearing_store = {};
}


function bearingValid(bearing){
	// Decide if a bearing should be plotted on the map, based on user options.
	var _show_bearing = false;

	// Filter out bearings below our confidence threshold.
	if (bearing.confidence > bearing_confidence_threshold){

		if (bearing.heading_valid == false) {
			// Only show bearings which have an invalid associated hearing if the user wants them.
			_show_bearing = document.getElementById("showStationaryBearings").checked;

		} else {
			_show_bearing = true;
		}
	}

	return _show_bearing;
}

function addBearing(timestamp, bearing, live){


	// Handle any raw data, if we have been passed it.
	var _raw_bearing_angles = [];
	var _raw_doa = [];
	if(bearing.hasOwnProperty('raw_bearing_angles')){
		// If we have raw data provided, extract it, then delete it from the bearing object,
		// as we don't want to store this persistently.
		_raw_bearing_angles = bearing.raw_bearing_angles;
		_raw_doa = bearing.raw_doa;
		delete bearing.raw_bearing_angles;
		delete bearing.raw_doa;
	}

	bearing_store[timestamp] = bearing;

	// Calculate the end position.
	var _end = calculateDestination(L.latLng([bearing_store[timestamp].lat, bearing_store[timestamp].lon]), bearing_store[timestamp].true_bearing, bearing_length);

	var _opacity = calculateBearingOpacity(timestamp);

	// Create the PolyLine
	bearing_store[timestamp].line = L.polyline(
		[[bearing_store[timestamp].lat, bearing_store[timestamp].lon],_end],{
			color: bearing_color,
			weight: bearing_weight,
			opacity: _opacity
		});

	_bearing_valid = bearingValid(bearing_store[timestamp]);
	if ( (_bearing_valid == true) && (document.getElementById("bearingsEnabled").checked == true) ){
		bearing_store[timestamp].line.addTo(map);
	}

	if ( (live == true) && (document.getElementById("bearingsEnabled").checked == true) ){
		
		if(_raw_bearing_angles.length > 0){
			if (bearing_store[timestamp].confidence > bearing_confidence_threshold){
				_valid_text = "YES";
			}else {
				_valid_text = "NO";
			}
			$("#bearing_table").tabulator("setData", [{id:1, valid_bearing:_valid_text, bearing: bearing_store[timestamp].raw_bearing.toFixed(0), confidence: bearing_store[timestamp].confidence.toFixed(0), power: bearing_store[timestamp].power.toFixed(0)}]);
			$("#bearing_table").show();

			if(document.getElementById("tdoaEnabled").checked == true){
				_valid_tdoa = bearing_store[timestamp].confidence > bearing_confidence_threshold;
				bearingPlotRender(_raw_bearing_angles, _raw_doa, _valid_tdoa);
				$('#bearing_plot').show();
			}else{
				$('#bearing_plot').hide();
			}
		}
	}

}


function removeBearings(timestamps){
	// Remove bearings from a supplied list
	timestamps.forEach(function (item, index){
		if(bearing_store.hasOwnProperty(item)){
			bearing_store[item].line.remove();
			delete bearing_store[item];
		}
	});

}


function restyleBearings(){
	// Update the bearing settings.
	updateBearingSettings();


	$.each(bearing_store, function(key, value) {
		// Calculate the end position.
		var _opacity = calculateBearingOpacity(key);

		// Create the PolyLine
		bearing_store[key].line.setStyle({
				color: bearing_color,
				weight: bearing_weight,
				opacity: _opacity
			});

	});
}


function redrawBearings(){
	// Update the bearing settings.
	updateBearingSettings();


	$.each(bearing_store, function(key, value) {
		// Remove bearing from map.
		bearing_store[key].line.remove();

		// Calculate the end position.
		var _end = calculateDestination(L.latLng([bearing_store[key].lat, bearing_store[key].lon]), bearing_store[key].true_bearing, bearing_length);
		var _opacity = calculateBearingOpacity(key);


		// Create the PolyLine
		bearing_store[key].line = L.polyline(
			[[bearing_store[key].lat, bearing_store[key].lon],_end],{
				color: bearing_color,
				weight: bearing_weight,
				opacity: _opacity
			});

		if ( (bearingValid(bearing_store[key]) == true) && (document.getElementById("bearingsEnabled").checked == true)){
			bearing_store[key].line.addTo(map);
		}

	});
}


function initialiseBearings(){

	// Destroy all existing bearings
	destroyAllBearings();

	// Update the bearing settings.
	updateBearingSettings();

	// Request the bearings from the client.
    $.ajax({
          url: "/get_bearings",
          dataType: 'json',
          async: true,
          success: function(data) {

			$.each(data, function(key, value) {
                addBearing(key, value, false);
            });
          }
    });

}


function bearingUpdate(data){
	// Remove any bearings that have been requested.
	removeBearings(data.remove);
	addBearing(data.add.timestamp, data.add, true);
}


function toggleBearingsEnabled(){
	// Enable-disable bearing only mode, which hides the summary and telemetry displays

	// Grab the bearing-only-mode settings.
	var _bearings_enabled = document.getElementById("bearingsEnabled").checked;


	if ((_bearings_enabled == true) && (bearings_on == false)){
		// Show all bearings.
		redrawBearings();
		bearings_on = true;


	} else if ((_bearings_enabled == false) && (bearings_on == true)){
		// Hide all bearings, which we can do by re-drawing them - as the bearingsEnabled
		// button is not checked, re-drawing will remove all bearing lines from the map, and not re-add them.
		redrawBearings();

		// Hide the bearing plot
		$("#bearing_plot").hide();
		// Hide the bearing table
		$("#bearing_table").hide();

		bearings_on = false;

	}
}


function toggleBearingsOnlyMode(){
	// Enable-disable bearing only mode, which hides the summary and telemetry displays

	// Grab the bearing-only-mode settings.
	var _bearings_only_enabled = document.getElementById("bearingsOnlyMode").checked;


	if ((_bearings_only_enabled == true) && (bearings_only_mode == false)){
		// The user had just enabled the bearings_only_mode, so hide things that are not relevant.
		
		$("#summary_table").hide();
		$("#telem_table_btn").hide();
		$("#telem_table").hide();
		$("#payload_age").hide();
		$("#pred_age").hide();

		bearings_only_mode = true;


	} else if ((_bearings_only_enabled == false) && (bearings_only_mode == true)){
		// Un-hide balloon stuff

		$("#summary_table").show();
		$("#telem_table_btn").show();
		$("#telem_table").show();
		$("#payload_age").show();
		$("#pred_age").show();

		bearings_only_mode = false;

	}
}


function flushBearings(){
	// Send a message to the server to flush the bearing store, then clear our local bearing store.
    var _confirm = confirm("Really clear all Bearing data?");
    if (_confirm == true){
        socket.emit('bearing_store_clear', {data: 'plzkthx'});

		destroyAllBearings();
	}

}



function bearingPlotRender(angles, doa, data_valid){

	// Trying a colorblind-friendly color scheme.
	if(data_valid == true){
		_stroke_color = "#1A85FF";
	} else {
		_stroke_color = "#D41159";
	}

	if(document.getElementById("bigTDOAEnabled").checked){
		_plot_dim = 400;
	}else{
		_plot_dim = 250;
	}

	if(dark_mode == true){
		_bg_color = "none";
	} else {
		_bg_color = "ghostwhite";
	}

	var _config = {
		"data": [{
			"t": angles,// [0,45,90,135,180,215,270,315], // theta values (x axis)
			"r": doa,//[-4,-3,-2,-1,0,-1,-2,-3,-4], // radial values (y axis)
			"name": "DOA", // name for the legend
			"visible": true,
			"color": _stroke_color, // color of data element
			"opacity": 1,
			"strokeColor": _stroke_color,
			"strokeDash": "solid", // solid, dot, dash (default)
			"strokeSize": 2,
			"visibleInLegend": false,
			"geometry": "AreaChart" // AreaChart, BarChart, DotPlot, LinePlot (default)
		}],
		"layout": {
			"height": _plot_dim, // (default: 450)
			"width": _plot_dim,
			"orientation":-90,
			"showlegend": false,
			"backgroundColor": _bg_color, // "ghostwhite",
			"radialAxis": {
				"domain": µ.DATAEXTENT,
				"visible": true
			},
			"margin": { 
				"top": 20,
				"right": 20,
				"bottom": 20,
				"left": 20
			},
		}};

    micropolar.Axis() // instantiate a new axis
  .config(_config) // configure it
  .render(d3.select('#bearing_plot'));
}

function toggle_bearing_plot_size(){
	if(bearing_large_plot == true){
		bearing_large_plot = false;
	}else{
		bearing_large_plot = true;
	}

	console.log(bearing_large_plot);
};

// TODO: This is not working
$("#bearing_plot").click(toggle_bearing_plot_size);

/**
	Returns the point that is a distance and heading away from
	the given origin point.
	@param {L.LatLng} latlng: origin point
	@param {float}: heading in degrees, clockwise from 0 degrees north.
	@param {float}: distance in meters
	@returns {L.latLng} the destination point.
	Many thanks to Chris Veness at http://www.movable-type.co.uk/scripts/latlong.html
	for a great reference and examples.

	Source: https://makinacorpus.github.io/Leaflet.GeometryUtil/leaflet.geometryutil.js.html#line712
*/
function calculateDestination(latlng, heading, distance) {
        heading = (heading + 360) % 360;
        var rad = Math.PI / 180,
            radInv = 180 / Math.PI,
            R = 6378137, // approximation of Earth's radius
            lon1 = latlng.lng * rad,
            lat1 = latlng.lat * rad,
            rheading = heading * rad,
            sinLat1 = Math.sin(lat1),
            cosLat1 = Math.cos(lat1),
            cosDistR = Math.cos(distance / R),
            sinDistR = Math.sin(distance / R),
            lat2 = Math.asin(sinLat1 * cosDistR + cosLat1 *
                sinDistR * Math.cos(rheading)),
            lon2 = lon1 + Math.atan2(Math.sin(rheading) * sinDistR *
                cosLat1, cosDistR - sinLat1 * Math.sin(lat2));
        lon2 = lon2 * radInv;
        lon2 = lon2 > 180 ? lon2 - 360 : lon2 < -180 ? lon2 + 360 : lon2;
        return L.latLng([lat2 * radInv, lon2]);
}


function calculateBearingOpacity(bearing_timestamp){
	if(bearing_timestamp > latest_server_timestamp){
		return bearing_max_opacity;
	}else if((latest_server_timestamp - bearing_timestamp) > bearing_max_age){
		return 0.0;
	}else{
		// Calculate an appropriate opacity.
		var _opacity = bearing_max_opacity -  (latest_server_timestamp - bearing_timestamp)/bearing_max_age;

		if (_opacity < bearing_min_opacity){
			_opacity = bearing_min_opacity;
		}
		return _opacity
	}

}

