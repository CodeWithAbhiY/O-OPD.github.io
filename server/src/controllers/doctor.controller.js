/* Doctors controllers. Thin layer: read validated input, call the service,
   return a consistent typed response. No SQL or business logic here. */

const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/doctor.service');
const { notFound } = require('../utils/httpError');

const list = asyncHandler(async (req, res) => {
    const { specialty, location, page, limit, sort } = req.validated.query;
    const { items, total } = await service.listDoctors({ specialty, location, page, limit, sort });

    res.json({
        data: items,
        pagination: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
        }
    });
});

const getById = asyncHandler(async (req, res) => {
    const doctor = await service.getDoctorById(req.validated.params.id);
    if (!doctor) throw notFound('Doctor not found');
    res.json({ data: doctor });
});

module.exports = { list, getById };
