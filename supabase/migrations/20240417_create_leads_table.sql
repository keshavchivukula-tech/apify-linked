-- Create the leads table
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    company TEXT NOT NULL,
    title TEXT,
    location TEXT,
    job_url TEXT,
    company_url TEXT,
    description TEXT,
    ceo_name TEXT,
    ceo_email TEXT,
    ceo_phone TEXT,
    keyword TEXT,
    search_location TEXT,
    status TEXT DEFAULT 'scraped'
);

-- Enable Row Level Security
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all users to read/insert for this demo
-- (In production, you should restrict this to authenticated users)
CREATE POLICY "Allow public access to leads" ON leads
    FOR ALL
    USING (true)
    WITH CHECK (true);
