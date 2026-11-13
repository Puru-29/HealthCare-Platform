import { cancelPatientAppointment, listPatientAppointments, } from '../services/appointment.service.js';
export const getPatientAppointments = async (_request, response) => {
    const { user } = response.locals;
    const data = await listPatientAppointments(user.id);
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({ data });
};
export const cancelAppointmentRequest = async (_request, response) => {
    const { user, appointmentId } = response.locals;
    await cancelPatientAppointment(user.id, appointmentId);
    response.status(200).json({ data: { id: appointmentId, status: 'cancelled' } });
};
