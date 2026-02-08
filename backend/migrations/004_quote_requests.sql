CREATE TABLE IF NOT EXISTS quote_requests (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    dob DATE NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    service_categories TEXT NOT NULL,
    doctor_id INTEGER,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_request_files (
    id SERIAL PRIMARY KEY,
    quote_request_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quote_requests_status_idx ON quote_requests (status);
CREATE INDEX IF NOT EXISTS quote_requests_created_at_idx ON quote_requests (created_at);
