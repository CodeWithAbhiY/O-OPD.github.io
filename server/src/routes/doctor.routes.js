const express = require('express');
const { validate } = require('../middleware/validate');
const schema = require('../schemas/doctor.schema');
const controller = require('../controllers/doctor.controller');

const router = express.Router();

router.get('/', validate({ query: schema.listQuery }), controller.list);
router.get('/:id', validate({ params: schema.idParam }), controller.getById);

module.exports = router;
