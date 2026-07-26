-- Create Maintenance Tickets Table
CREATE TABLE public.maintenance_tickets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  landlord_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status IN ('Pending', 'In-Progress', 'Resolved')) DEFAULT 'Pending',
  image_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (id)
);

-- Enable RLS
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;

-- Tenants can view their own tickets
CREATE POLICY "Tenants view own tickets" ON public.maintenance_tickets 
FOR SELECT USING (auth.uid() = tenant_id);

-- Tenants can insert their own tickets
CREATE POLICY "Tenants insert own tickets" ON public.maintenance_tickets 
FOR INSERT WITH CHECK (auth.uid() = tenant_id);

-- Landlords can view tickets for their properties
CREATE POLICY "Landlords view property tickets" ON public.maintenance_tickets 
FOR SELECT USING (auth.uid() = landlord_id);

-- Landlords can update tickets for their properties (to change status)
CREATE POLICY "Landlords update property tickets" ON public.maintenance_tickets 
FOR UPDATE USING (auth.uid() = landlord_id);

-- Storage bucket for ticket images
INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-images', 'ticket-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for ticket-images
CREATE POLICY "Public ticket images viewable by everyone" ON storage.objects 
FOR SELECT USING (bucket_id = 'ticket-images');

CREATE POLICY "Authenticated users can upload ticket images" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'ticket-images' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their ticket images" ON storage.objects 
FOR UPDATE USING (bucket_id = 'ticket-images' AND auth.uid()::text = (storage.foldername(name))[2]);

CREATE POLICY "Users can delete their ticket images" ON storage.objects 
FOR DELETE USING (bucket_id = 'ticket-images' AND auth.uid()::text = (storage.foldername(name))[2]);
