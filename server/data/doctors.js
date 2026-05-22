/* =====================================================================
   Seed data — sample doctors / hospitals.
   In a real app this lives in a database. For now it's a plain array
   the API reads from. `key` is a lowercase stem used to match a
   searched specialty (e.g. "Cardiology (heart)" includes "cardiolog").
   ===================================================================== */

const doctors = [
    { id: 1, doctor: 'Dr. Asha Mehta', key: 'cardiolog', specialty: 'Cardiology', hospital: 'City Care Hospital', area: 'Andheri', rating: 4.8, exp: 14, fee: 700, distance: 2.1, slots: ['09:30', '10:15', '11:00', '12:30', '17:00'] },
    { id: 2, doctor: 'Dr. Rajiv Khanna', key: 'cardiolog', specialty: 'Cardiology', hospital: 'Sunrise Heart Institute', area: 'Bandra', rating: 4.6, exp: 20, fee: 900, distance: 4.7, slots: ['10:00', '13:00', '16:30'] },
    { id: 3, doctor: 'Dr. Neha Verma', key: 'orthoped', specialty: 'Orthopedics', hospital: 'Apollo Bone & Joint', area: 'Powai', rating: 4.7, exp: 11, fee: 600, distance: 3.4, slots: ['09:00', '09:45', '11:30', '15:00', '18:00'] },
    { id: 4, doctor: 'Dr. Sameer Iyer', key: 'orthoped', specialty: 'Orthopedics', hospital: 'City Care Hospital', area: 'Andheri', rating: 4.4, exp: 9, fee: 550, distance: 2.1, slots: ['10:30', '14:00', '16:00'] },
    { id: 5, doctor: 'Dr. Priya Nair', key: 'ophthalmolog', specialty: 'Ophthalmology', hospital: 'Vision Plus Eye Care', area: 'Vile Parle', rating: 4.9, exp: 16, fee: 500, distance: 1.6, slots: ['09:15', '10:45', '12:00', '17:30'] },
    { id: 6, doctor: 'Dr. Karan Shah', key: 'ent', specialty: 'ENT', hospital: 'Sunrise Multispeciality', area: 'Bandra', rating: 4.5, exp: 12, fee: 550, distance: 4.7, slots: ['11:00', '13:30', '15:30'] },
    { id: 7, doctor: 'Dr. Meera Joshi', key: 'pediatric', specialty: 'Pediatrics', hospital: 'Little Stars Children’s Hospital', area: 'Santacruz', rating: 4.9, exp: 18, fee: 600, distance: 2.9, slots: ['09:00', '10:00', '11:00', '16:00', '17:00'] },
    { id: 8, doctor: 'Dr. Anil Kapoor', key: 'pediatric', specialty: 'Pediatrics', hospital: 'City Care Hospital', area: 'Andheri', rating: 4.3, exp: 8, fee: 500, distance: 2.1, slots: ['12:00', '14:30'] },
    { id: 9, doctor: 'Dr. Sneha Rao', key: 'dermatolog', specialty: 'Dermatology', hospital: 'GlowDerm Skin Clinic', area: 'Juhu', rating: 4.7, exp: 10, fee: 650, distance: 3.0, slots: ['10:00', '11:30', '13:00', '18:30'] },
    { id: 10, doctor: 'Dr. Vikram Sinha', key: 'neurolog', specialty: 'Neurology', hospital: 'NeuroLife Hospital', area: 'Powai', rating: 4.8, exp: 22, fee: 1000, distance: 3.4, slots: ['09:30', '12:30', '16:00'] },
    { id: 11, doctor: 'Dr. Fatima Sheikh', key: 'pulmonolog', specialty: 'Pulmonology', hospital: 'Breathe Well Hospital', area: 'Kurla', rating: 4.5, exp: 13, fee: 600, distance: 5.2, slots: ['10:15', '11:45', '15:00'] },
    { id: 12, doctor: 'Dr. Rohan Desai', key: 'gastro', specialty: 'Gastroenterology', hospital: 'Apollo Digestive Care', area: 'Powai', rating: 4.6, exp: 15, fee: 800, distance: 3.4, slots: ['09:45', '13:15', '17:15'] },
    { id: 13, doctor: 'Dr. Kavita Menon', key: 'gynec', specialty: 'Gynecology', hospital: 'Motherhood Hospital', area: 'Santacruz', rating: 4.8, exp: 17, fee: 700, distance: 2.9, slots: ['10:00', '11:00', '14:00', '16:30'] },
    { id: 14, doctor: 'Dr. Imran Qureshi', key: 'psychiatr', specialty: 'Psychiatry', hospital: 'MindCare Clinic', area: 'Bandra', rating: 4.7, exp: 12, fee: 900, distance: 4.7, slots: ['11:00', '15:00', '18:00'] },
    { id: 15, doctor: 'Dr. Pooja Bhatt', key: 'dent', specialty: 'Dentistry', hospital: 'SmileBright Dental', area: 'Vile Parle', rating: 4.6, exp: 9, fee: 400, distance: 1.6, slots: ['09:30', '10:30', '12:00', '17:00', '18:30'] },
    { id: 16, doctor: 'Dr. Suresh Pillai', key: 'general', specialty: 'General Physician', hospital: 'City Care Hospital', area: 'Andheri', rating: 4.5, exp: 19, fee: 400, distance: 2.1, slots: ['09:00', '10:00', '11:00', '12:00', '16:00', '17:00'] },
    { id: 17, doctor: 'Dr. Ananya Gupta', key: 'general', specialty: 'General Physician', hospital: 'Sunrise Multispeciality', area: 'Bandra', rating: 4.4, exp: 7, fee: 350, distance: 4.7, slots: ['10:30', '13:30', '15:30', '18:00'] }
];

module.exports = doctors;
