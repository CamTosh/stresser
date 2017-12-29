'use strict';
const cluster = require('cluster');
const workers = Object.keys(cluster.workers);

const range = require('node-range');
const pad = require('pad');

const helpers = require('./helpers');
const display = require('./display');

const config = require('./config');

const amount = config.count;

let _statsForSecond = null;
const resetStats = () => {
    _statsForSecond = {
        code: {
            '1': 0,
            '2': 0,
            '3': 0,
            '4': 0,
            '5': 0
        },
        err: 0,
        to: 0,
        body: 0,

        cnt: 0,
        time: 0,
        min: Infinity,
        max: 0
    }
};
resetStats();

const SEND = (type, data) => {
    workers.forEach(wid => cluster.workers[wid].send({ type, data }))
};

let _RAW_CNT = 0;
const RAW = (data) => {
    data.forEach((req) => _requests.push(req));
    _RAW_CNT++;
    if (_RAW_CNT % workers.length === 0) {
        _finish();
    }
};

let _STATS_CNT = 0;
const STATS = (data, reqCnt) => {
    _statsForSecond.err += data.err;
    _statsForSecond.to += data.to;
    _statsForSecond.body += data.body;
    _statsForSecond.cnt += data.cnt;
    _statsForSecond.time += data.time;

    _statsForSecond.min = Math.min(_statsForSecond.min, data.min);
    _statsForSecond.max = Math.max(_statsForSecond.max, data.max);

    for (let i = 1; i <= 5; i++) {
        _statsForSecond.code[i.toString()] += data.code[i.toString()];
    }

    _requestCountActive += reqCnt;

    _STATS_CNT++;
    if (_STATS_CNT % workers.length === 0) {
        printStats(_statsForSecond);

        _second++;

        const somethingLeft = (
            _statsForSecond.cnt === 0 &&
            _statsForSecond.err === 0 &&
            _statsForSecond.to === 0 &&
            _requestCountActive === 0
        );

        const forceStop = (
            config.force &&
            _second > config.count
        );

        if (
            somethingLeft || forceStop
        ) {
            SEND('raw');
        } else {
            _secondHistory.push(Object.assign({}, _statsForSecond, { active: _requestCountActive }));
            setTimeout(_doWork, 1000);
        }

        resetStats();
        _requestCountActive = 0;
    }
};


workers
    .map(wid => cluster.workers[wid])
    .forEach(worker => {
        worker.on('message', (msg) => {
            switch (msg.type) {
                case 'stats':
                    STATS(msg.data, msg.req);
                    break;
                case 'raw':
                    RAW(msg.data);
                    break;
            }
        })
    });

const _requests = [];
let _requestCountActive = 0;
let _second = 0;
const _secondHistory = [];

const printStats = (stats, finish) => {
    let str = (
        `
        Second:${pad(6, _second)} | Completed:${pad(4, stats.cnt + stats.to + stats.err)} | Active:${pad(6, _requestCountActive)}
        Failed:${pad(6, stats.err)} | Timeout:${pad(6, stats.to)} | W/B:${pad(9, stats.body)}
        Min:${pad(9, stats.min)} | Max:${pad(10, stats.max)} | Avg:${pad(9, (stats.time / stats.cnt) | 0)}
        Http code : 
        ${range(1, 6).map(code => `${code}xx=${pad(8+code, stats.code[code.toString()])}`).join(' | ')}
    `);

    const howManyReq = config.concurrentPerCPU * config.CPUs * config.count;
    const howManyDone = stats.cnt + stats.err + stats.to;
    if (finish && howManyDone < howManyReq) {
        str += `NOT FINISHED:=${pad(6, howManyReq - howManyDone)}`;
    }

    console.error(str);
    return str;
};

const _finish = () => {
    workers.forEach(worker => cluster.workers[worker].kill());

    const stats = {
        code: {
            '1': 0,
            '2': 0,
            '3': 0,
            '4': 0,
            '5': 0
        },
        err: 0,
        to: 0,
        body: 0,

        cnt: 0,
        time: 0,
        min: Infinity,
        max: 0
    };
    _requests.forEach(req => {
        stats.to += req.to;
        stats.err += req.err;
        stats.body += req.body;

        stats.code[req.code.toString()[0]]++;

        if (req.time) {
            stats.time += req.time;
            stats.cnt++;

            if (req.time < stats.min) {
                stats.min = req.time;
            }
            if (req.time > stats.max) {
                stats.max = req.time;
            }
        }
    });

    console.error('~~~ Aggregated Stats: ~~~');

    const statsStr = printStats(stats, true);

    if (config.html) {
        display(config.html, _requests, statsStr, _secondHistory, config.url);
    }

    setTimeout(() => process.exit(0), 100);
};

const _doWork = () => {
    if (_second < amount) {
        _requestCountActive += config.concurrentPerCPU * workers.length;
        SEND('req', _second);
    }

    SEND('stats');
};

_doWork();