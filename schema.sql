create table if not exists departments(id serial primary key, name text not null);
create table if not exists users(id serial primary key, username text not null, hash text not null, role text not null);
create table if not exists patients(id serial primary key, name text not null, age integer, gender text, phone text, address text, type text);
create table if not exists doctors(id serial primary key, name text not null, department_id integer, schedule_days text, start_time text, end_time text);
create table if not exists appointments(id serial primary key, patient_id integer, doctor_id integer, date date, time text, status text);
create table if not exists admissions(id serial primary key, patient_id integer, doctor_id integer, ward text, admitted date, discharged date);
create table if not exists medical_records(id serial primary key, patient_id integer, doctor_id integer, diagnosis text, treatment text, prescription text, medicine_id integer, quantity integer, dispensed boolean default false, created date);
create table if not exists lab_tests(id serial primary key, patient_id integer, test text, status text, result text, created date);
create table if not exists pharmacy(id serial primary key, name text not null, quantity integer, reorder_level integer, expiry date, price numeric);
create table if not exists billing(id serial primary key, patient_id integer, consultation numeric, laboratory numeric, pharmacy numeric, admission numeric, created date);
create table if not exists payments(id serial primary key, billing_id integer, amount numeric, method text, paid_on date);
create table if not exists employees(id serial primary key, name text not null, role text, department_id integer, phone text);
create table if not exists attendance(id serial primary key, employee_id integer, date date, status text);
create table if not exists leaves(id serial primary key, employee_id integer, from_date date, to_date date, reason text);
create table if not exists documents(id serial primary key, patient_id integer, filename text, data text, uploaded text);
create table if not exists audit_logs(id serial primary key, username text, action text, at text)
