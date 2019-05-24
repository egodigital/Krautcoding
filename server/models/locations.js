'use strict';

var loopback = require('loopback');

var distance = require('google-distance-matrix');

var chargingStations = require('../charging-pois/Aachen');
// only consider full cars at stations
var chargedCars = chargingStations.filter(station => station.State.occupied && station.State.percentage >= 50);

module.exports = function(locations) {
	/**
	 * get nearest station from client
	 * @param {geopoint} current location of client
	 * @param {geopoint} destination location of the destination
	 * @param best station
	 */
	var getNearestStation = function(current, destination) {
		let best = {};
		let secbest = {};
		chargedCars.forEach(car => {
			car.distance = Math.sqrt(Math.pow(current.lat - car.AddressInfo.Latitude, 2) + Math.pow(current.lng - car.AddressInfo.Longitude, 2))
				+ Math.sqrt(Math.pow(destination.lat - car.AddressInfo.Latitude, 2) + Math.pow(destination.lng - car.AddressInfo.Longitude, 2));
			if (secbest.distance == null || secbest.distance > car.distance) {
				secbest = car;
				if (best.distance == null || best.distance > secbest.distance) {
					let switchvar = secbest;
					secbest = best;
					best = switchvar;
				}
			}
		});
		return {best, secbest};
	};


	var getBestStation = function(trips) {
		let best = {};
		let secbest = {};
		trips.forEach(function  (trip, index) { if(index==0)return;
			if (secbest.duration == null || secbest.duration > trip.duration) {
				secbest = trip;
				if (best.duration == null || best.duration > secbest.duration) {
					let switchvar = secbest;
					secbest = best;
					best = switchvar;
				}
			}
		})
		return {best, secbest};
	}

	/**
	 * get locations from client
	 * @param {geopoint} current location of client
	 * @param {geopoint} destination location of the destination
	 * @param {Function(Error, array)} callback
	 */
	locations.route = function(current, destination, callback) {
	  var options;

	 // console.log(best);


	var waypoints = chargedCars.map(function(car) {return {GeoPoint: loopback.GeoPoint([car.AddressInfo.Latitude, car.AddressInfo.Longitude]), AddressName: car.AddressInfo.AddressLine1};});

	var callbackcounter = 2;
	var origins = [current];
	var waypointsstart = [destination, ...waypoints.map(x => x.GeoPoint)];
	var fromCurrent = [];
	var toDestination = [];
	var trips = [];
	distance.matrix(origins, waypointsstart, function (err, distances) {
		--callbackcounter;
		if (!err) {
			fromCurrent = distances.rows[0].elements;
			if (callbackcounter<=0)
				writeoutput();
		}

	});
	distance.matrix(waypoints.map(x => x.GeoPoint), [destination], function (err, distances) {
		--callbackcounter;
		if (!err) {
			toDestination = distances.rows.map(row => row.elements[0]);
			if (callbackcounter<=0)
				writeoutput();
		}
	});

	function writeoutput() {

		for (var i=1; i<fromCurrent.length; i++) {
				trips[i]={	waypoint: waypoints[i-1],
							distance: fromCurrent[i].distance.value + toDestination[i-1].distance.value,
				 			duration: fromCurrent[i].duration.value + toDestination[i-1].duration.value
				 		 }
			};
		trips[0] = {distance: fromCurrent[0].distance.value,
					duration: fromCurrent[0].duration.value
					};

		var best = getBestStation(trips).best;
	  	var secbest = getBestStation(trips).secbest;

		options = [
	  				{
	  					name: 'Direct Route',
	  					waypoints: [
	  						current,
	  						destination
	  					],
	  					discount: '0%',
	  					distance: fromCurrent[0].distance.value,
	  					duration: fromCurrent[0].duration.value
	  				},
	  				{
	  					name: 'Option 1',
	  					waypoints: [
	  						current,
	  						best.waypoint,
	  						destination
	  					],
	  					discount: '10%',
	  					distance: (best.distance),
	  					// 2 minutes parking!
	  					duration: (best.duration + 120)
	  				},
	  				{
	  					name: 'Option 2',
	  					waypoints: [
	  						current,
	  						secbest.waypoint,
	  						destination
	  					],
	  					discount: '20%',
	  					distance: secbest.distance,
	  					// 2 minutes parking!
	  					duration: (secbest.duration + 120)
	  				}
	  			]
	  callback(null, options);

	}
	};


	/**
	 * Return list of all charging points
	 * @param {Function(Error, array)} callback
	 */
	locations.chargings = function(callback) {
		var chargingPoints = chargedCars;
		// TODO
		callback(null, chargingPoints);
	};

};
