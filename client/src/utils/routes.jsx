import Folder from '../assets/images/icons/folder(1).svg';
import demoicons from './icons.demo.json';
import logogray from '../assets/images/icons/cosmos_gray.png';

import * as Yup from 'yup';
import { Alert, Grid } from '@mui/material';
import { debounce, isDomain } from './indexs';

import * as API from '../api';
import { useEffect, useState } from 'react';

export const sanitizeRoute = (_route) => {
  let route = { ..._route };

  if (!route.UseHost) {
    route.Host = "";
  }
  if (!route.UsePathPrefix) {
    route.PathPrefix = "";
  }

  route.Name = route.Name.trim();

  if (!route.SmartShield) {
    route.SmartShield = {};
  }

  if (typeof route._SmartShield_Enabled !== "undefined") {
    route.SmartShield.Enabled = route._SmartShield_Enabled;
    delete route._SmartShield_Enabled;
  }

  return route;
}

const addProtocol = (url) => {
  if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) {
    return url;
  }
  // get current protocol
  if (window.location.protocol === "http:") {
    return "http://" + url;
  }
  return "https://" + url;
}

export const getOrigin = (route) => {
  return (route.UseHost ? route.Host : window.location.origin) + (route.UsePathPrefix ? route.PathPrefix : '');
}

export const getFullOrigin = (route) => {
  return addProtocol(getOrigin(route));
}

const isDemo = import.meta.env.MODE === 'demo';

export const getFaviconURL = (route) => {
  if (isDemo) {
    if (route.Mode == "STATIC")
      return Folder;
    return demoicons[route.Name] || logogray;
  }

  if (!route) {
    return logogray;
  }

  const addRemote = (url) => {
    return '/cosmos/api/favicon?q=' + encodeURIComponent(url)
  }

  if (route.Mode == "SERVAPP" || route.Mode == "PROXY") {
    return addRemote(route.Target)
  } else if (route.Mode == "STATIC") {
    return Folder;
  } else {
    return addRemote(addProtocol(getOrigin(route)));
  }
}

export const ValidateRouteSchema = Yup.object().shape({
  Name: Yup.string().required('Name is required'),
  Mode: Yup.string().required('Mode is required'),
  Target: Yup.string().required('Target is required').when('Mode', {
    is: 'SERVAPP',
    then: Yup.string().matches(/:[0-9]+$/, 'Invalid Target, must have a port'),
  }).when('Mode', {
    is: 'PROXY',
    then: Yup.string().matches(/^(https?:\/\/)/, 'Invalid Target, must start with http:// or https://'),
  }),

  Host: Yup.string().when('UseHost', {
    is: true,
    then: Yup.string().required('Host is required')
      .matches(/[\.|\:]/, 'Host must be full domain ([sub.]domain.com) or an IP (IPs won\'t work with Let\'s Encrypt!)')
  }),

  PathPrefix: Yup.string().when('UsePathPrefix', {
    is: true,
    then: Yup.string().required('Path Prefix is required').matches(/^\//, 'Path Prefix must start with / (e.g. /api). Do not include a domain/subdomain in it, use the Host for this.')
  }),

  UseHost: Yup.boolean().when('UsePathPrefix',
    {
      is: false,
      then: Yup.boolean().oneOf([true], 'Source must at least be either Host or Path Prefix')
    }),
})

export const ValidateRoute = (routeConfig, config) => {
  let routeNames = config.HTTPConfig.ProxyConfig.Routes.map((r) => r.Name);

  try {
    ValidateRouteSchema.validateSync(routeConfig);
  } catch (e) {
    return e.errors;
  }
  if (routeNames.includes(routeConfig.Name)) {
    return ['Route Name already exists. Name must be unique.'];
  }
  return [];
}

export const getContainersRoutes = (config, containerName) => {
  return (config && config.HTTPConfig && config.HTTPConfig.ProxyConfig.Routes && config.HTTPConfig.ProxyConfig.Routes.filter((route) => {
    let reg = new RegExp(`^(([a-z]+):\/\/)?${containerName}(:?[0-9]+)?$`, 'i');
    return route.Mode == "SERVAPP" && reg.test(route.Target)
  })) || [];
}

const checkHost = debounce((host, setHostError, setHostIp) => {
  if (isDomain(host)) {
    API.getDNS(host).then((data) => {
      setHostError(null)
      setHostIp(data.data)
    }).catch((err) => {
      setHostError(err.message)
      setHostIp(null)
    });
  } else {
    setHostError(null);
    setHostIp(null);
  }
}, 500)

export const HostnameChecker = ({hostname}) => {
  const [hostError, setHostError] = useState(null);
  const [hostIp, setHostIp] = useState(null);

  useEffect(() => {
    if (hostname) {
      checkHost(hostname, setHostError, setHostIp);
    }
  }, [hostname]);

  return <>{hostError && <Alert color='error'>{hostError}</Alert>}

    {hostIp && <Alert color='info'>This hostname is pointing to <strong>{hostIp}</strong>, make sure it is your server IP!</Alert>}
  </>
};

const hostnameIsDomainReg = /^((?!localhost|\d+\.\d+\.\d+\.\d+)[a-zA-Z0-9\-]{1,63}\.)+[a-zA-Z]{2,63}$/

export const getHostnameFromName = (name, route, config) => {
  let origin = window.location.origin.split('://')[1];
  let protocol = window.location.origin.split('://')[0];
  let res;

  if(origin.match(hostnameIsDomainReg)) {
    res = name.replace('/', '').replace(/_/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase().replace(/\s/g, '-') + '.' + origin
    if(route)
      res = (route.hostPrefix || '') + res + (route.hostSuffix || '');
  } else {
    const existingRoutes = Object.values(config.HTTPConfig.ProxyConfig.Routes);
    origin = origin.split(':')[0];

    // find first port available in range 7200-7400
    let port = protocol == "https" ? 7200 : 7351;
    let endPort = protocol == "https" ? 7350 : 7500;
    while(port < endPort) {
      if(!existingRoutes.find((exiroute) => exiroute.Host == (origin + ":" + port))) {
        res = origin + ":" + port;
        return res;
      }
      else
        port++;
      }
      
    return "NO MORE PORT AVAILABLE. PLEASE CLEAN YOUR URLS!";
  }
  return res;
}