CREATE TABLE IF NOT EXISTS lab_packages (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    price_mur NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'MUR',
    preparation_note TEXT,
    category TEXT,
    contents JSONB NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lab_packages_sort_order_idx ON lab_packages (sort_order);

INSERT INTO lab_packages
    (slug, name, price_mur, currency, preparation_note, category, contents, sort_order, is_active)
VALUES
    (
        'essential-health-screen',
        'Essential Health Screen',
        750,
        'MUR',
        'Preparation: fasting may be required',
        'Preventive Care',
        '["Full Blood Count (FBC)", "Fasting Blood Glucose", "Total Cholesterol", "Creatinine + eGFR"]'::jsonb,
        1,
        TRUE
    ),
    (
        'routine-health-screen',
        'Routine Health Screen',
        1100,
        'MUR',
        'Preparation: fasting may be required',
        'Preventive Care',
        '["Full Blood Count (FBC)", "Fasting Blood Glucose", "Total Cholesterol", "Uric Acid", "Creatinine + eGFR", "GGT (Gamma GT)"]'::jsonb,
        2,
        TRUE
    ),
    (
        'comprehensive-health-screen',
        'Comprehensive Health Screen',
        2200,
        'MUR',
        'Preparation: fasting may be required',
        'Preventive Care',
        '["Full Blood Count (FBC)", "Fasting Blood Glucose", "Lipid Profile", "Liver Function Tests (LFT)", "Urea", "Creatinine + eGFR", "Uric Acid", "Serum Calcium"]'::jsonb,
        3,
        TRUE
    ),
    (
        'diabetes-monitoring-bundle',
        'Diabetes Monitoring Bundle',
        1450,
        'MUR',
        'Preparation: fasting recommended',
        'Diagnostic Tests',
        '["Fasting Blood Glucose", "HbA1c", "Lipid Profile", "Creatinine + eGFR"]'::jsonb,
        4,
        TRUE
    ),
    (
        'thyroid-profile',
        'Thyroid Profile',
        1715,
        'MUR',
        'Preparation: no fasting required in most cases',
        'Diagnostic Tests',
        '["TSH", "Free T3 (FT3)", "Free T4 (FT4)"]'::jsonb,
        5,
        TRUE
    ),
    (
        'liver-function-bundle',
        'Liver Function Bundle',
        745,
        'MUR',
        'Preparation: fasting may be recommended',
        'Diagnostic Tests',
        '["ALT (SGPT)", "AST (SGOT)", "GGT (Gamma GT)", "Bilirubin (Total/Direct)", "Albumin / Total Protein"]'::jsonb,
        6,
        TRUE
    ),
    (
        'advanced-metabolic-panel',
        'Advanced Metabolic Panel',
        2000,
        'MUR',
        'Preparation: fasting may be required',
        'Preventive Care',
        '["Full Blood Count (FBC)", "Uric Acid", "Lipid Profile", "HbA1c", "Creatinine", "AST (SGOT)", "ALT (SGPT)", "GGT (Gamma GT)", "Total Protein"]'::jsonb,
        7,
        TRUE
    ),
    (
        'fertility-essentials',
        'Fertility Essentials',
        4290,
        'MUR',
        'Preparation: timing may depend on cycle day',
        'Specialist Appointment',
        '["FSH", "LH", "Prolactin", "Estradiol", "Progesterone", "AMH (Anti-Mullerian Hormone)"]'::jsonb,
        8,
        TRUE
    )
ON CONFLICT (slug) DO NOTHING;
