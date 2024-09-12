const express = require('express');
const protobuf = require("protobufjs");
const { parse } = require('csv-parse/sync');
const unzipper = require('unzipper');

let routes = [];
let trips = [];
let shapes = [];
let stops = [];
let stopTimes = [];

let root = protobuf.loadSync('gtfs-realtime.proto');
let FeedMessage = root.lookupType("transit_realtime.FeedMessage");

let DateFormatter = new Intl.DateTimeFormat(
    undefined,
    {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Toronto'
    });

const app = express();

app.use(express.static('public'));

async function UpdateArrays()
{
    let fs = require("fs"); 
    routes = parse(fs.readFileSync("backup_data/routes.txt"),{columns: true }); 
    trips = parse(fs.readFileSync("backup_data/trips.txt"),{columns: true }); 
    shapes = parse(fs.readFileSync("backup_data/shapes.txt"),{columns: true }); 
    stops = parse(fs.readFileSync("backup_data/stops.txt"),{columns: true }); 
    stopTimes = parse(fs.readFileSync("backup_data/stop_times.txt"),{columns: true }); 
}

function ConvertUnixTimestampToString(timestampSeconds)
{
    let dateObj = new Date(timestampSeconds * 1000); // Dates use milliseconds in constructor

    return DateFormatter.format(dateObj);
}

async function GetRouteData(routeId)
{
    let route = routes.find(x => x.route_id === routeId);

    if (!route)
    {
        await UpdateArrays();
    }

    route = routes.find(x => x.route_id === routeId);

    return { routeName: route?.route_short_name ?? '?', routeColour: route?.route_color ?? '000000' };
}

app.get('/bus-positions', async function (req, res)
{
    let vehiclePositionsResponse = await fetch('https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/vehicle/vehiclepositions.pb');
    if (vehiclePositionsResponse.ok)
    {
        let object = FeedMessage.toObject(FeedMessage.decode(new Uint8Array(await vehiclePositionsResponse.arrayBuffer())));
        
        let vehicles = [];
                
        for (let entityIndex in object.entity)
        {
            const routeData = await GetRouteData(object.entity[entityIndex].vehicle.trip.routeId);
            vehicles.push({ routeShortName: routeData.routeName, routeColour: routeData.routeColour, position: object.entity[entityIndex].vehicle.position });
        }

        res.json(vehicles);
    }
});

app.get('/alerts', async function (req, res)
{
    let alertsResponse = await fetch('https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/alert/alerts.pb');
    if (alertsResponse.ok)
    {
        let object = FeedMessage.toObject(FeedMessage.decode(new Uint8Array(await alertsResponse.arrayBuffer())), 
        {
            enums: String,
            longs: Number
        });

        let alerts = [];

        for (let entityIndex in object.entity)
        {
            let routeAndStopInfo = [];
            object.entity[entityIndex].alert.informedEntity.forEach(idPair =>
            {
                routeAndStopInfo.push(
                {
                    routeShortName: routes.find(route => route.route_id === idPair.routeId).route_short_name,
                    stopName: stops.find(stop => stop.stop_id === idPair.stopId).stop_name
                });
            });
            
            alerts.push(
            {
                activePeriod:
                {
                    start: ConvertUnixTimestampToString(object.entity[entityIndex].alert.activePeriod[0].start),
                    end: ConvertUnixTimestampToString(object.entity[entityIndex].alert.activePeriod[0].end)
                },
                routeAndStopInfo: routeAndStopInfo,
                alertType: object.entity[entityIndex].alert.effect,
                descriptionText: object.entity[entityIndex].alert.ttsDescriptionText.translation[0].text
            });
        }
        res.json(alerts);
    }
});

app.get('/shape-coords-for-route-id', function (req, res)
{
    let result = [];
    let shapeIds = new Set();

    trips.filter(trip => trip.route_id === req.query.routeId).forEach(trip => shapeIds.add(trip.shape_id));
    
    shapeIds.forEach(shapeId =>
    {
        let shapeCoords = [];
        shapes.filter(shape => shape.shape_id === shapeId).forEach(shape => shapeCoords.push({ lat: Number(shape.shape_pt_lat), lng: Number(shape.shape_pt_lon) }));
        result.push(shapeCoords);
    });
    
    res.json(result);
});

app.get('/route-data', function (req, res)
{
    let result = [];
    let tripIdStopIds = {};
    
    stopTimes.forEach(stopTime =>
    {
        let key = stopTime.trip_id;
        if (!tripIdStopIds[key])
        {
            tripIdStopIds[key] = { stopIds: new Set([stopTime.stop_id]) };
        }
        else
        {
            tripIdStopIds[key].stopIds.add(stopTime.stop_id);
        }
    });

    routes.forEach(route =>
    {
        let routeStopIds = new Set();
        trips
            .filter(trip => trip.route_id === route.route_id)
            .forEach(trip => tripIdStopIds[trip.trip_id].stopIds.forEach(stopId => routeStopIds.add(stopId)));
        
        let routeStops = [];
        routeStopIds.forEach(stopId =>
        {
            let stop = stops.find(stop => stop.stop_id == stopId);
            routeStops.push({ stopName: stop.stop_name, stopLat: Number(stop.stop_lat), stopLon: Number(stop.stop_lon), stopId: stop.stop_id });
        });

        result.push({ routeId: route.route_id, routeShortName: route.route_short_name, routeLongName: route.route_long_name, routeColor: route.route_color, routeStops: routeStops });
    });
    
    res.json(result);
});

app.listen(8081, async function()
{
    await UpdateArrays();
});

setInterval(async function()
{
    await UpdateArrays();
}, 1000 * 60 * 60 * 24);
