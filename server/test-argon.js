const argon2 = require('argon2'); argon2.verify('=19=65536,t=3,p=4+DwPJHi+/WfYYnLSctw+A/+tNZlKMibLZgLOSAz3w/4Y/4ExJeqoaOGFJfQ', 'password').then(console.log).catch(console.error)
