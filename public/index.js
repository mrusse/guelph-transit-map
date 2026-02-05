const CSS_CLASS_SELECTED = 'selected';
const CSS_CLASS_ROUNDCORNERS = 'rcorners';
const CSS_CLASS_BUTTONDIV = 'buttonDiv';
const CSS_CLASS_ALERTSDIV = 'alertsDiv';
const CSS_CLASS_BUTTON = 'button';
const CSS_CLASS_TOGGLE_BUTTON = 'toggleButton';
const CSS_CLASS_TOGGLE_BUTTON_ACTIVE = 'toggleButtonActive';
const CSS_CLASS_CURRENT_LOCATION_BUTTON = 'currentLocationButton';
const CSS_CLASS_CURRENT_LOCATION_BUTTON_IMAGE = 'currentLocationButtonImage';
const CSS_CLASS_ALERTS_CLOSE_BUTTON = 'alertsCloseButton';
const UPDATE_INTERVAL_SEC = 31;

let map;
let showStops = false;
let showLocation = false;
let locationMarker;
let busPositionMarkers = [];
let displayedRoutes = [];
let displayedStops = [];
let busPositions = [];
let openPopup = null;

let loading = true;
let secCount = UPDATE_INTERVAL_SEC;
let showControls = true;

let siteControlsLeafletControl = null;
let currentLocationLeafletControl = null;
let routeButtonsLeafletControl = null;
let alertsLeafletControl = null;

function latLngObjToArray(obj)
{
  return [Number(obj.lat), Number(obj.lng)];
}

function safeClosePopup()
{
  try
  {
    map.closePopup();
  }
  catch (_)
  {
  }
  openPopup = null;
}

async function InitializeMap()
{
  map = L.map('map',
  {
    zoomControl: false
  }).setView([43.538832, -80.245294], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  map.on('click', MapClick);

  let siteControlsDiv = document.createElement('div');
  siteControlsDiv.id = 'siteControlsDiv';
  siteControlsDiv.classList.add(CSS_CLASS_ROUNDCORNERS);

  L.DomEvent.disableClickPropagation(siteControlsDiv);
  L.DomEvent.disableScrollPropagation(siteControlsDiv);

  let titleHeading = document.createElement('h1');
  titleHeading.innerText = 'Guelph Transit Map';
  siteControlsDiv.appendChild(titleHeading);

  siteControlsDiv.appendChild(document.createElement('br'));

  let countdownHeading = document.createElement('h3');
  countdownHeading.id = 'countdownHeading';
  countdownHeading.textContent = 'Loading...';
  siteControlsDiv.appendChild(countdownHeading);

  siteControlsDiv.appendChild(document.createElement('hr'));

  let toggleStopsButton = document.createElement('button');
  toggleStopsButton.id = 'toggleStopsButton';
  toggleStopsButton.textContent = 'Show/Hide Bus Stops';
  toggleStopsButton.classList.add(CSS_CLASS_TOGGLE_BUTTON);
  toggleStopsButton.addEventListener('click', ToggleStops);
  siteControlsDiv.appendChild(toggleStopsButton);

  let toggleAlertsButton = document.createElement('button');
  toggleAlertsButton.id = 'toggleAlertsButton';
  toggleAlertsButton.textContent = 'View Alerts';
  toggleAlertsButton.classList.add(CSS_CLASS_TOGGLE_BUTTON);
  toggleAlertsButton.addEventListener('click', ToggleAlerts);
  siteControlsDiv.appendChild(toggleAlertsButton);

  siteControlsLeafletControl = L.control(
  {
    position: 'topleft'
  });

  siteControlsLeafletControl.onAdd = () => siteControlsDiv;
  siteControlsLeafletControl.addTo(map);

  let currentLocationControlDiv = document.createElement('div');
  currentLocationControlDiv.id = 'currentLocationControl';
  currentLocationControlDiv.style.marginTop = '15px';

  L.DomEvent.disableClickPropagation(currentLocationControlDiv);
  L.DomEvent.disableScrollPropagation(currentLocationControlDiv);

  let currentLocationButton = document.createElement('button');
  currentLocationButton.title = 'Display current location';
  currentLocationButton.classList.add(CSS_CLASS_CURRENT_LOCATION_BUTTON);
  currentLocationControlDiv.appendChild(currentLocationButton);

  let currentLocationButtonImage = document.createElement('div');
  currentLocationButtonImage.id = 'currentLocationButtonImage';
  currentLocationButtonImage.classList.add(CSS_CLASS_CURRENT_LOCATION_BUTTON_IMAGE);
  currentLocationButton.appendChild(currentLocationButtonImage);

  currentLocationButton.addEventListener('click', function ()
  {
    showLocation = !showLocation;
    if (showLocation)
    {
      ShowCurrentLocation(true);
    }
    else
    {
      if (locationMarker)
      {
        map.removeLayer(locationMarker);
      }
      currentLocationButtonImage.style.backgroundPosition = '0 0';
    }
  });

  
  currentLocationLeafletControl = L.control(
  {
    position: 'topright'
  });

  currentLocationLeafletControl.onAdd = () => currentLocationControlDiv;
  currentLocationLeafletControl.addTo(map);

  map.zoomControl = L.control.zoom(
  {
    position: 'topright'
  });

  map.zoomControl.addTo(map);

  let routeToggleButtonsDiv = document.createElement('div');
  routeToggleButtonsDiv.id = 'routeToggleButtonsDiv';
  routeToggleButtonsDiv.classList.add(CSS_CLASS_BUTTONDIV);

  L.DomEvent.disableClickPropagation(routeToggleButtonsDiv);
  L.DomEvent.disableScrollPropagation(routeToggleButtonsDiv);

  let routeDataResponse = await fetch('route-data');
  if (routeDataResponse.ok)
  {
    let routes = await routeDataResponse.json();
    routes.sort(CompareRoutes);

    routes.forEach(route =>
    {
      const routeToggleButton = document.createElement('button');
      routeToggleButton.textContent = route.routeShortName + ' - ' + route.routeLongName;
      routeToggleButton.style.backgroundColor = '#' + route.routeColor;
      routeToggleButton.id = route.routeShortName;
      routeToggleButton.classList.add(CSS_CLASS_BUTTON);
      routeToggleButton.addEventListener('click', async () => await ToggleRoute(route));
      routeToggleButtonsDiv.appendChild(routeToggleButton);
    });

    document.getElementById('map').appendChild(routeToggleButtonsDiv);
  }

  let alertsDiv = document.createElement('div');
  alertsDiv.id = 'alertsDiv';
  alertsDiv.classList.add(CSS_CLASS_ALERTSDIV);

  L.DomEvent.disableClickPropagation(alertsDiv);

  let alertsCloseButton = document.createElement('button');
  alertsCloseButton.id = 'alertsCloseButton';
  alertsCloseButton.textContent = 'X';
  alertsCloseButton.addEventListener('click', ToggleAlerts);
  alertsCloseButton.classList.add(CSS_CLASS_ALERTS_CLOSE_BUTTON);
  alertsDiv.appendChild(alertsCloseButton);
  alertsDiv.hidden = true;

  let response = await fetch('alerts');
  if (response.ok)
  {
    let alerts = await response.json();
    alerts.forEach(alert =>
    {
      let alertType = document.createElement('h1');
      alertType.innerText = alert.alertType + ':';
      alertsDiv.appendChild(alertType);

      alertsDiv.appendChild(document.createElement('br'));

      let alertText = document.createElement('h2');
      alertText.innerText = alert.descriptionText;
      alertsDiv.appendChild(alertText);

      alertsDiv.appendChild(document.createElement('br'));

      let alertActivePeriod = document.createElement('p');
      alertActivePeriod.innerText = 'Active from: ' + alert.activePeriod.start + ' - ' + alert.activePeriod.end;
      alertsDiv.appendChild(alertActivePeriod);

      alertsDiv.appendChild(document.createElement('br'));

      let affectedRoutes = document.createElement('h4');
      affectedRoutes.innerText = 'Affected Routes / Stops:';
      alertsDiv.appendChild(affectedRoutes);

      alertsDiv.appendChild(document.createElement('br'));

      alert.routeAndStopInfo.forEach(info =>
      {
        let affectedRouteAndStopText = document.createElement('p');
        affectedRouteAndStopText.innerText = '  ' + info.routeShortName + ': ' + info.stopName;
        alertsDiv.appendChild(affectedRouteAndStopText);
      });

      alertsDiv.appendChild(document.createElement('hr'));
    });
  }

  alertsDiv.addEventListener('wheel', function (e)
  {
    e.stopPropagation();
  }, { passive: true });

  alertsDiv.addEventListener('touchmove', function (e)
  {
    e.stopPropagation();
  }, { passive: true });

  document.getElementById('map').appendChild(alertsDiv);

  await UpdateMarkers(true);
  loading = false;
}

function ShowCurrentLocation(setMapCenter)
{
  document.getElementById('currentLocationButtonImage').style.backgroundPosition = '0 0';

  if (locationMarker)
  {
    map.removeLayer(locationMarker);
  }

  if (navigator.geolocation)
  {
    navigator.geolocation.getCurrentPosition(position =>
    {
      let pos = [position.coords.latitude, position.coords.longitude];

      const icon = L.icon(
      {
        iconUrl: 'current_location.png',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      locationMarker = L.marker(pos,
      {
        icon
      }).addTo(map);

      if (setMapCenter)
      {
        map.setView(pos, 16);
      }

      document.getElementById('currentLocationButtonImage').style.backgroundPosition = (-45 * 9) + 'px 0';
    });
  }
}

function getBusIconData(bearing)
{
  let iconUrl = 'bus.png';
  let labelStyle = 'left:15px; top:12px;';

  if (337.5 < bearing || bearing <= 22.5)
  {
    iconUrl = 'bus-north.png';
    labelStyle = 'left:15px; top:19px;';
  }
  else if (22.5 < bearing && bearing <= 67.5)
  {
    iconUrl = 'bus-northeast.png';
    labelStyle = 'left:15px; top:16px;';
  }
  else if (67.5 < bearing && bearing <= 112.5)
  {
    iconUrl = 'bus-east.png';
    labelStyle = 'left:15px; top:12px;';
  }
  else if (112.5 < bearing && bearing <= 157.5)
  {
    iconUrl = 'bus-southeast.png';
    labelStyle = 'left:15px; top:12px;';
  }
  else if (157.5 < bearing && bearing <= 202.5)
  {
    iconUrl = 'bus-south.png';
    labelStyle = 'left:15px; top:12px;';
  }
  else if (202.5 < bearing && bearing <= 247.5)
  {
    iconUrl = 'bus-southwest.png';
    labelStyle = 'left:18px; top:12px;';
  }
  else if (247.5 < bearing && bearing <= 292.5)
  {
    iconUrl = 'bus-west.png';
    labelStyle = 'left:21px; top:12px;';
  }
  else if (292.5 < bearing && bearing <= 337.5)
  {
    iconUrl = 'bus-northwest.png';
    labelStyle = 'left:17px; top:16px;';
  }
  else if (bearing === undefined)
  {
    console.log('Could not determine direction of bus with undefined bearing');
  }
  else
  {
    console.warn(`Could not determine directional icon for bearing ${bearing}`);
  }

  return { iconUrl, labelStyle };
}

function makeBusDivIcon(busIconUrl, labelText, labelColor, labelFontSizePx, labelStyle)
{
  const html = `
    <div style="position: relative; width: 32px; height: 32px;">
      <img src="${busIconUrl}" style="width: 32px; height: 32px; display:block;" />
      <div style="
        position:absolute;
        ${labelStyle}
        transform: translate(-50%, -50%);
        font-weight: bold;
        font-size: ${labelFontSizePx}px;
        color: ${labelColor};
        text-shadow: 0 0 2px rgba(0,0,0,0.6);
        pointer-events:none;
        white-space:nowrap;
      ">${labelText}</div>
    </div>
  `;

  return L.divIcon(
  {
    html,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

async function UpdateMarkers(fetchNewData)
{
  if (fetchNewData)
  {
    let response = await fetch('bus-positions');
    if (response.ok)
    {
      busPositions = await response.json();
    }
  }

  busPositionMarkers.forEach(marker => map.removeLayer(marker));
  busPositionMarkers = [];

  const selectedBtns = document.getElementsByClassName(CSS_CLASS_SELECTED);

  busPositions.forEach(bus =>
  {
    if (selectedBtns.namedItem(bus.routeShortName) || selectedBtns.length === 0)
    {
      const busIconData = getBusIconData(bus.position.bearing);

      let labelText = bus.routeShortName;

      if (labelText === '99')
      {
        let splitHeadsign = bus.tripHeadsign.split(' ');
        if (splitHeadsign.length > 2)
        {
          labelText += bus.tripHeadsign.split(' ')[2].charAt(0);
        }
      }

      const labelFontSizePx = labelText.length > 2 ? 10 : 17;

      const icon = makeBusDivIcon(
        busIconData.iconUrl,
        labelText,
        bus.routeColour,
        labelFontSizePx,
        busIconData.labelStyle
      );

      const marker = L.marker(
        [bus.position.latitude, bus.position.longitude],
        { icon }
      ).addTo(map);

      marker.on('click', () =>
      {
        safeClosePopup();

        const popupHtml = `<div style="font-size:17px; font-weight:bold;">${bus.tripHeadsign}</div>`;
        marker.bindPopup(popupHtml, { closeButton: true }).openPopup();

        openPopup = marker;
      });

      busPositionMarkers.push(marker);
    }
  });

  if (showLocation)
  {
    if (locationMarker)
    {
      map.removeLayer(locationMarker);
    }
    ShowCurrentLocation(false);
  }
}

setInterval(async function ()
{
  secCount--;
  if (secCount <= 0)
  {
    secCount = UPDATE_INTERVAL_SEC;
    await UpdateMarkers(true);
  }

  if (!loading)
  {
    document.getElementById('countdownHeading').textContent =
      'Next update in ' + secCount + ' seconds';
  }
}, 1000);

async function ToggleRoute(route)
{
  const btn = document.getElementById(route.routeShortName);

  if (!btn.classList.contains(CSS_CLASS_SELECTED))
  {
    let response = await fetch(
      'shape-coords-for-route-id?' +
      new URLSearchParams({ routeId: route.routeId })
    );

    let coordSetList = [];
    if (response.ok)
    {
      coordSetList = await response.json();
    }

    let routeObj =
    {
      route: route,
      lines: []
    };

    coordSetList.forEach(coordSet =>
    {
      const latLngs = coordSet.map(latLngObjToArray);
      const line = L.polyline(
        latLngs,
        { color: '#' + route.routeColor, weight: 5 }
      ).addTo(map);

      routeObj.lines.push(line);
    });

    displayedRoutes.push(routeObj);

    if (showStops)
    {
      DisplayStops(route);
    }

    btn.classList.add(CSS_CLASS_SELECTED);
  }
  else
  {
    let displayedRouteIndex = displayedRoutes.findIndex(
      displayedRoute =>
        displayedRoute.route.routeId === route.routeId
    );

    displayedRoutes[displayedRouteIndex].lines.forEach(line =>
      map.removeLayer(line)
    );

    displayedRoutes.splice(displayedRouteIndex, 1);

    if (showStops)
    {
      let displayedStopIndex = displayedStops.findIndex(
        displayedStopList =>
          displayedStopList.routeId === route.routeId
      );

      if (displayedStopIndex !== -1)
      {
        displayedStops[displayedStopIndex].stops.forEach(stop =>
          map.removeLayer(stop)
        );

        displayedStops.splice(displayedStopIndex, 1);
      }
    }

    btn.classList.remove(CSS_CLASS_SELECTED);
  }

  await UpdateMarkers(false);
}

function ToggleStops()
{
  showStops = !showStops;
  let toggleStopsButton = document.getElementById('toggleStopsButton');

  if (showStops)
  {
    toggleStopsButton.classList.add(CSS_CLASS_TOGGLE_BUTTON_ACTIVE);
    displayedRoutes.forEach(displayedRoute =>
      DisplayStops(displayedRoute.route)
    );
  }
  else
  {
    toggleStopsButton.classList.remove(CSS_CLASS_TOGGLE_BUTTON_ACTIVE);

    displayedStops.forEach(displayedStop =>
      displayedStop.stops.forEach(stop =>
        map.removeLayer(stop)
      )
    );

    displayedStops = [];
  }
}

function ToggleAlerts()
{
  ToggleMapControls();

  let alertsDiv = document.getElementById('alertsDiv');
  alertsDiv.hidden = !alertsDiv.hidden;
}

function DisplayStops(route)
{
  let stopObj =
  {
    routeId: route.routeId,
    stops: []
  };

  const stopIcon = L.icon(
  {
    iconUrl: 'marker.png',
    iconSize: [24, 24],
    iconAnchor: [12, 24]
  });

  route.routeStops.forEach(stop =>
  {
    let marker = L.marker(
      [stop.stopLat, stop.stopLon],
      { icon: stopIcon }
    ).addTo(map);

    marker.on('click', () =>
    {
      safeClosePopup();
      const popupHtml =
        `<div style="font-size:17px; font-weight:bold;">${stop.stopName}</div>`;

      marker.bindPopup(popupHtml, { closeButton: true }).openPopup();
      openPopup = marker;
    });

    stopObj.stops.push(marker);
  });

  displayedStops.push(stopObj);
}

function MapClick()
{
  if (openPopup !== null)
  {
    safeClosePopup();
  }
  else
  {
    ToggleMapControls();
  }
}

function ToggleMapControls()
{
  showControls = !showControls;

  const siteControlsDiv =
    document.getElementById('siteControlsDiv');

  const routeToggleButtonsDiv =
    document.getElementById('routeToggleButtonsDiv');

  const currentLocationControl =
    document.getElementById('currentLocationControl');

  if (showControls)
  {
    siteControlsDiv.classList.remove('hidden');

    if (routeToggleButtonsDiv)
    {
      routeToggleButtonsDiv.classList.remove('hidden');
    }

    currentLocationControl.classList.remove('hidden');

    if (!map.zoomControl)
    {
      map.zoomControl = L.control.zoom();
    }

    map.zoomControl.addTo(map);
  }
  else
  {
    siteControlsDiv.classList.add('hidden');

    if (routeToggleButtonsDiv)
    {
      routeToggleButtonsDiv.classList.add('hidden');
    }

    currentLocationControl.classList.add('hidden');

    if (map.zoomControl)
    {
      map.zoomControl.remove();
    }
  }
}

function CompareRoutes(routeA, routeB)
{
  let routeA_num = Number(routeA.routeShortName);
  let routeB_num = Number(routeB.routeShortName);

  if (routeA_num === 99)
  {
    return Number.MIN_SAFE_INTEGER;
  }
  else if (routeB_num === 99)
  {
    return Number.MAX_SAFE_INTEGER;
  }
  else if (routeA_num !== NaN && routeB_num !== NaN)
  {
    return routeA_num - routeB_num;
  }
  else
  {
    return routeA.routeShortName.localeCompare(
      routeB.routeShortName
    );
  }
}

document.addEventListener('DOMContentLoaded', () =>
{
  InitializeMap().catch(err => console.error(err));
});