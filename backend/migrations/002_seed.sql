INSERT INTO doctors (id, full_name, email, specialty, phone, is_active, availability_days, availability_start, availability_end)
SELECT 201, 'Dr Test', 'doctor@test.com', 'General Practice', NULL, TRUE, '["mon","tue","wed","thu","fri"]', '09:00', '17:00'
WHERE NOT EXISTS (
    SELECT 1 FROM doctors WHERE id = 201 OR LOWER(email) = LOWER('doctor@test.com')
);

INSERT INTO doctors (id, full_name, email, specialty, phone, is_active, availability_days, availability_start, availability_end)
SELECT 202, 'Dr Alice Brown', 'alice.brown@medconnect.test', 'Cardiology', '+23000000001', TRUE, '["mon","wed","fri"]', '09:00', '15:00'
WHERE NOT EXISTS (
    SELECT 1 FROM doctors WHERE id = 202 OR LOWER(email) = LOWER('alice.brown@medconnect.test')
);

INSERT INTO doctors (id, full_name, email, specialty, phone, is_active, availability_days, availability_start, availability_end)
SELECT 203, 'Dr Marcus Lee', 'marcus.lee@medconnect.test', 'Dermatology', '+23000000002', TRUE, '["tue","thu"]', '10:00', '16:00'
WHERE NOT EXISTS (
    SELECT 1 FROM doctors WHERE id = 203 OR LOWER(email) = LOWER('marcus.lee@medconnect.test')
);

INSERT INTO appointments (doctor_id, doctor, specialty, date, time, name, email, phone, status)
SELECT 201, 'Dr Test', 'General Practice', TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'), '10:00', 'Test Patient', 'patient@test.com', '+23000000000', 'booked'
WHERE NOT EXISTS (
    SELECT 1 FROM appointments WHERE doctor_id = 201 AND date = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AND time = '10:00' AND email = 'patient@test.com'
);

INSERT INTO appointments (doctor_id, doctor, specialty, date, time, name, email, phone, status)
SELECT 201, 'Dr Test', 'General Practice', TO_CHAR(CURRENT_DATE + INTERVAL '1 day', 'YYYY-MM-DD'), '11:00', 'Test Patient', 'patient@test.com', '+23000000000', 'confirmed'
WHERE NOT EXISTS (
    SELECT 1 FROM appointments WHERE doctor_id = 201 AND date = TO_CHAR(CURRENT_DATE + INTERVAL '1 day', 'YYYY-MM-DD') AND time = '11:00' AND email = 'patient@test.com'
);

INSERT INTO appointments (doctor_id, doctor, specialty, date, time, name, email, phone, status)
SELECT 202, 'Dr Alice Brown', 'Cardiology', TO_CHAR(CURRENT_DATE + INTERVAL '2 day', 'YYYY-MM-DD'), '09:00', 'Jamie Lee', 'jamie.lee@test.com', '+23000000003', 'booked'
WHERE NOT EXISTS (
    SELECT 1 FROM appointments WHERE doctor_id = 202 AND date = TO_CHAR(CURRENT_DATE + INTERVAL '2 day', 'YYYY-MM-DD') AND time = '09:00' AND email = 'jamie.lee@test.com'
);

SELECT setval(pg_get_serial_sequence('doctors','id'), GREATEST(COALESCE((SELECT MAX(id) FROM doctors), 1), 203));
SELECT setval(pg_get_serial_sequence('appointments','id'), GREATEST(COALESCE((SELECT MAX(id) FROM appointments), 1), 1));
