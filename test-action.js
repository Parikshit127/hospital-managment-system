const { getRecentPatientHistory } = require('./app/actions/patient-history-actions');

async function test() {
    const res = await getRecentPatientHistory();
    console.log(JSON.stringify(res, null, 2));
}

test().catch(console.error);
