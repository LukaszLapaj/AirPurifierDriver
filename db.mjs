import Sequelize from 'sequelize';

export let sequelize;

const host = "localhost";
const port = "5432";
const databaseName = "home";
const login = "postgres";
const password = "";

try {
    sequelize = new Sequelize("postgresql://" + login + ":" + password + "@" + host + ":" + port + "/" + databaseName + "?ssl=false", {
        logging: false,
        idleTimeoutMillis: 10000
    });
} catch (e) {
    console.log("Database connection error");
}

export const Air = sequelize.define('air', {
    date: {
        type: Sequelize.DATE,
        primaryKey: true
    },
    temperature: {
        type: Sequelize.FLOAT,
        allowNull: false
    },
    humidity: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    pm25: {
        type: Sequelize.FLOAT,
        allowNull: false
    },
    level: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
});

export const Airly = sequelize.define('airly', {
    date: {
        type: Sequelize.DATE,
        primaryKey: true
    },
    temperature: {
        type: Sequelize.FLOAT,
        allowNull: false
    },
    humidity: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    pressure: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    pm25: {
        type: Sequelize.FLOAT,
        allowNull: false
    },
    pm10: {
        type: Sequelize.FLOAT,
        allowNull: false
    },
    pm1: {
        type: Sequelize.FLOAT,
        allowNull: true
    },
});

sequelize.sync();

async function saveToDatabase(purifier, date) {
    let humidity = purifier.humidity, pm25 = purifier.pm25, mode = purifier.mode, level = purifier.level,
        temperature = purifier.temperature;
    let data = {date, temperature: temperature, humidity, pm25, mode, level: level};
    try {
        await db.Air.create(data);
    } catch (e) {
        console.log("Database insert error");
    }
}

export async function logData(purifier, date) {
    await saveToDatabase(purifier, date);
}