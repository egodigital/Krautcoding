const mapsApiKey = require('./tracker_configuration.json').mapsApiKey;
const _async = require('asyncawait/async');
const _await = require('asyncawait/await');
const Promise = require('bluebird');
const moment = require('moment');
const polyline = require('@mapbox/polyline');

const googleMapsClient = require('@google/maps').createClient({
  key: mapsApiKey,
  Promise
});


exports.PathGenerator = class {
  constructor(current_moment, busLocationsRef, panelConfig, generatedPaths) {
    this.current_moment = current_moment;
    this.busLocationsRef = busLocationsRef;
    this.panelConfig = panelConfig; // use to init in each hub some schlepper; know how many schleppers there are. give ids to each
    this.paths = generatedPaths;

    this.tugs = [];
    const tugs_per_hub = 1;

    this.next_trip_id = 0;

     this.carColors = ["green", "purple", "red"];

    // TODO panel size must be 1
    var self = this; // alias to access this in for loop
    this.panelConfig[0].markers.forEach((marker, markerIndex) => {
      // TODO if hub is in name
      var i = 0;
      for (i = 0; i < tugs_per_hub; i++) {            
        self.tugs.push({
          lat: marker.lat, // waiting position if not driving
          lon: marker.lng,
          id: (markerIndex * tugs_per_hub + i),
          //is_tugging: false,
          reserved_until: self.current_moment // save time until the tug is reserved
        });
      }
    });

    var ip = get_local_ip_adress();
    ip = ip ? ip : '127.0.0.1';
    
    // API request
    const express = require('express'),
      app = express(),
      port = process.env.PORT || 3000;
    
    app.listen(port, ip);

    console.log('RESTful API server started on: ' + ip + ':' + port);

    app.get('/route', async function(req, res) {
      var status = false;
      if(req.query.lat1 && req.query.lon1 && req.query.lat2 && req.query.lon2) {
        var lat1 = parseFloat(req.query.lat1);
        var lon1 = parseFloat(req.query.lon1);
        var lat2 = parseFloat(req.query.lat2);
        var lon2 = parseFloat(req.query.lon2);
        if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
          _async(() => {
            res.sendStatus(self.request(lat1, lon1, lat2, lon2) ? 200 : 418);
          })().catch(err => {
            console.error(err);
          });
        } else {
          res.sendStatus(418);
        }
      } else {
        res.sendStatus(418);
      }
    });
  }

  distance(lat1, lon1, lat2, lon2, unit = "K") {
    if ((lat1 == lat2) && (lon1 == lon2)) {
      return 0;
    }
    else {
      var radlat1 = Math.PI * lat1/180;
      var radlat2 = Math.PI * lat2/180;
      var theta = lon1-lon2;
      var radtheta = Math.PI * theta/180;
      var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
      if (dist > 1) {
        dist = 1;
      }
      dist = Math.acos(dist);
      dist = dist * 180/Math.PI;
      dist = dist * 60 * 1.1515;
      if (unit=="K") { dist = dist * 1.609344 } // kilometers
      if (unit=="N") { dist = dist * 0.8684 } // nautical miles
      return dist;
    }
  }

  request(lat1, lon1, lat2, lon2) {
    // search best tug
    var bestTugIndex = -1;
    var shortestDistance = Infinity;
    var self = this;
    this.tugs.forEach((tug, tugIndex) => {
      // if tug is free
      if (tug.reserved_until <= this.current_moment) { // TODO optimization potenzial
        var newDistance = self.distance(lat2, lon2, tug.lat, tug.lon);
        if (newDistance < shortestDistance) {
          shortestDistance = newDistance;
          bestTugIndex = tugIndex;
        }
      }
    });

    if (bestTugIndex == -1) {
      return false;
    }

    var tug = this.tugs[bestTugIndex];
    
    // route vehicle to destination
    var vehicle_path = this.generate_paths(lat1, lon1, lat2, lon2);
    vehicle_path.trip.tug = {};
    vehicle_path.trip.color = this.carColors[Math.floor(Math.random() * this.carColors.length)];

    // route tug to destination, is_tugging: false
    var tug_path_get = this.generate_paths(tug.lat, tug.lon, lat2, lon2, null, vehicle_path.points[vehicle_path.points.length - 1].time);
    tug_path_get.trip.tug = {is_tugging: false};
    tug_path_get.trip.color = "moover";

    var tug_start_time = this.get_time_cursor(tug_path_get.points[0].time);
    
    var time_diff = tug_start_time.diff(this.current_moment.valueOf(), "seconds");
    if (Math.abs(time_diff) > 15) {
      // No tug is able to be fast enough at the vehicle destination
      return false;
    }

    this.paths.push(vehicle_path);
    this.paths.push(tug_path_get);

    // TODO add some time for tugging
    var tug_path_return = this.generate_paths(lat2, lon2, tug.lat, tug.lon, tug_path_get.points[tug_path_get.points.length - 1].time);
    tug_path_return.trip.tug = {is_tugging: true};
    tug_path_return.trip.color = "moover_tugging";
    this.paths.push(tug_path_return);

    tug.reserved_until = this.get_time_cursor(tug_path_return.points[tug_path_return.points.length -1].time);

    return true;
  }

  generate_paths(lat1, lon1, lat2, lon2, start_time = null, end_time = null) {
    const request = {origin: [lat1, lon1], destination: [lat2, lon2]};

    var response = _await(googleMapsClient.directions(request).asPromise()).json;

    if (response.status === 'OK') {
      var departure_date = start_time != null ? start_time.slice(0, 8) : this.current_moment.format('YYYYMMDD');
      var departure_time = start_time != null ? start_time.slice(9, 17) : this.current_moment.format('hh:mm::ss');

      var trip = {
        "route_id": -1,
        "service_id": "-1",
        "trip_headsign": "rip",
        "trip_id": this.next_trip_id,
        "departure_date": departure_date,
        "departure_time": departure_time,
        "departure_stop_id": 0, // TODO what is this?
        "color": "",
      };
      this.next_trip_id++;

      const timeCursor = moment(
        `${trip.departure_date} ${trip.departure_time}`,
        'YYYYMMDD HH:mm:ss'
      );

      const tripPoints = [];
      const route = response.routes[0];

      route.legs.forEach(leg => {
        leg.steps.forEach(step => {
          const durationInSeconds = step.duration.value;
          const points = polyline.decode(step.polyline.points);
          const secondsPerPoint = durationInSeconds / points.length;
          points.forEach(point => {
            tripPoints.push({
              time: timeCursor.format('YYYYMMDD HH:mm:ss'),
              location: {lat: point[0], lng: point[1]}
            });
            timeCursor.add(secondsPerPoint, 'seconds');
          });
        });
      });
      
      if (end_time != null) {
        var real_end_time = tripPoints[tripPoints.length - 1].time;
        var time_diff = this.get_time_cursor(end_time).diff(this.get_time_cursor(real_end_time), "seconds");
        tripPoints.forEach(point => {
          var mom = this.get_time_cursor(point.time);
          mom.add(time_diff, "seconds");
          point.time = mom.format('YYYYMMDD HH:mm:ss');
        })
        trip.departure_date = tripPoints[0].time.slice(0, 8)
        trip.departure_time = tripPoints[0].time.slice(9, 17)
      }

      return {trip: trip, points: tripPoints};
    } else {
      console.log('ERROR');
    }
  }

  get_time_cursor(time) {
    var date = time.slice(0, 8);
    var t = time.slice(9, 17);

    const timeCursor = moment.utc(
      `${date} ${t}`,
      'YYYYMMDD HH:mm:ss'
    );

    return timeCursor;
  }
};

function get_local_ip_adress() {
  var os = require('os');
  var ifaces = os.networkInterfaces();

  var ip;

  Object.keys(ifaces).forEach(function (ifname) {
    var alias = 0;

    ifaces[ifname].forEach(function (iface) {
      if ('IPv4' !== iface.family || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return;
      }

      if (alias >= 1) {
        // this single interface has multiple ipv4 addresses
        console.log(ifname + ':' + alias, iface.address);
        return;
      } else {
        // this interface has only one ipv4 adress
        console.log(ifname, iface.address);
        ip = iface.address;
      }
      ++alias;
    });
  });
  return ip;
}