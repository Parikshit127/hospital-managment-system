const bcrypt = require('bcryptjs');
const hash = '$2b$10$29giO2v5L5NFeiePTjpVquI/C.hP0jt7ZmmGCSMnaJseUZUwvGEFq';
bcrypt.compare('superadmin123', hash).then(res => console.log('Match:', res));
