# Xiaomi Air Purifier 2/2S Driver
An improved driver for Xiaomi Air Purifier 2/2S automation.

# Features:
- Force turn on / favourite mode
- Display settings
- Day/Night mode
- Day/Night cooling
- Unconditional speed boost
- Low/Critical humidity warning
- High temperature warning
- Low temperature protection
- Highly customisable speed
- Database logger
- Airly logger

# Requirements
- Postgres SQL Server
- Node.js 12.1+
- Yarn

# Install
```
yarn install
npm install
```

# Configuration
Go to `app.mjs` and set necessary flags:
```
airPurifierIP = 'AIR PURIFIER IP ADDRESS';
```
If You want to use Airly measurements:
```
airlyApiKey = "AIRLY API KEY";
latitude = "LATITUDE";
longitude = "LONGITUDE";
```
Or disable it by setting:
```
enableAirly = false;
```
Setup database connection `db.mjs`. All necessary fields will be created automatically.
```
const host = "localhost";
const port = "5432";
const databaseName = "home";
const login = "postgres";
const password = "";
```
If You won't be using database, remove this import in `app.mjs` and set logging flag to false:
```
import * as db from './db.mjs';
```
```
databaseLogging = false;
```

# Running the driver
Start your database server, then application:
```
nodejs --experimental-modules index.mjs
```

# Example logged data
I highly recommend using grafana to create graphs.
<img src="screenshots/grafana.PNG" width="600">

## Credits
* [bartekn](https://github.com/bartekn) for initial idea.
* [aholstenson](https://github.com/aholstenson) for miio library.