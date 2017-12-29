'use strict';
const fs = require('fs');
const os = require('os');

const path = require('path');
const display = (filePath, data, output, seconds, url) => {
    filePath = path.resolve(filePath);

    let file = fs.readFileSync(path.join(__dirname, 'template.html')).toString();

    file = file.replace('\'%%TIMES%%\'', JSON.stringify(data.filter(r => !!r.code).map(r => r.time)));

    file = file.replace('\'%%SECONDS%%\'', JSON.stringify(seconds));
    //file = file.replace('%%OUTPUT%%', output.split('\n').map(str => `<h3>${str}</h3>`).join('\n'));
    file = file.replace('%%OUTPUT%%', output);

    file = file.replace('%%URL%%', url);
    file = file.replace('%%LINK%%', "'"+url+"'");

    try {
        fs.writeFileSync(filePath, file);
    } catch (ex) {
        console.error(ex.stack || ex);
        console.error();
        console.error('Could not write report file in', filePath);
        filePath = path.join(os.tmpdir(), `report-${Date.now()}.html`);
        console.error('Defaulting to', filePath);
        fs.writeFileSync(filePath, file);
    }

    console.error('report file available at:', `file://${path.resolve(filePath)}`);
};

module.exports = display;
