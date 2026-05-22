/* Doctors controllers. Thin layer: read validated input, call the service,
   return a consistent typed response. No SQL or business logic here. */

const service = require('../services/doctor.service');
const { notFound } = require('../utils/httpError');

function list(req, res) {
    const { specialty, location, page, limit, sort } = req.validated.query;
    const { items, total } = service.listDoctors({ specialty, location, page, limit, sort });

    res.json({
        data: items,
        pagination: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
        }
    });
}

function getById(req, res, next) {
    const doctor = service.getDoctorById(req.validated.params.id);
    if (!doctor) return next(notFound('Doctor not found'));
    res.json({ data: doctor });
}

module.exports = { list, getById };
