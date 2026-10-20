-- Hidden Kenya: factual reference data and the platform's own taxonomy.
--
-- This migration contains NO businesses, listings, destinations, reviews, users or
-- transactions. It contains:
--   1. Kenya's 47 counties with their official numbering.
--      Source: Constitution of Kenya 2010, First Schedule (Article 6(1)).
--      former_province is the pre-2013 provincial grouping, widely used as a travel region.
--   2. The experience-category taxonomy used to organise listings (platform configuration;
--      editable by administrators).

insert into public.counties (code, name, slug, former_province) values
  (1,  'Mombasa',          'mombasa',          'Coast'),
  (2,  'Kwale',            'kwale',            'Coast'),
  (3,  'Kilifi',           'kilifi',           'Coast'),
  (4,  'Tana River',       'tana-river',       'Coast'),
  (5,  'Lamu',             'lamu',             'Coast'),
  (6,  'Taita-Taveta',     'taita-taveta',     'Coast'),
  (7,  'Garissa',          'garissa',          'North Eastern'),
  (8,  'Wajir',            'wajir',            'North Eastern'),
  (9,  'Mandera',          'mandera',          'North Eastern'),
  (10, 'Marsabit',         'marsabit',         'Eastern'),
  (11, 'Isiolo',           'isiolo',           'Eastern'),
  (12, 'Meru',             'meru',             'Eastern'),
  (13, 'Tharaka-Nithi',    'tharaka-nithi',    'Eastern'),
  (14, 'Embu',             'embu',             'Eastern'),
  (15, 'Kitui',            'kitui',            'Eastern'),
  (16, 'Machakos',         'machakos',         'Eastern'),
  (17, 'Makueni',          'makueni',          'Eastern'),
  (18, 'Nyandarua',        'nyandarua',        'Central'),
  (19, 'Nyeri',            'nyeri',            'Central'),
  (20, 'Kirinyaga',        'kirinyaga',        'Central'),
  (21, 'Murang''a',        'muranga',          'Central'),
  (22, 'Kiambu',           'kiambu',           'Central'),
  (23, 'Turkana',          'turkana',          'Rift Valley'),
  (24, 'West Pokot',       'west-pokot',       'Rift Valley'),
  (25, 'Samburu',          'samburu',          'Rift Valley'),
  (26, 'Trans Nzoia',      'trans-nzoia',      'Rift Valley'),
  (27, 'Uasin Gishu',      'uasin-gishu',      'Rift Valley'),
  (28, 'Elgeyo-Marakwet',  'elgeyo-marakwet',  'Rift Valley'),
  (29, 'Nandi',            'nandi',            'Rift Valley'),
  (30, 'Baringo',          'baringo',          'Rift Valley'),
  (31, 'Laikipia',         'laikipia',         'Rift Valley'),
  (32, 'Nakuru',           'nakuru',           'Rift Valley'),
  (33, 'Narok',            'narok',            'Rift Valley'),
  (34, 'Kajiado',          'kajiado',          'Rift Valley'),
  (35, 'Kericho',          'kericho',          'Rift Valley'),
  (36, 'Bomet',            'bomet',            'Rift Valley'),
  (37, 'Kakamega',         'kakamega',         'Western'),
  (38, 'Vihiga',           'vihiga',           'Western'),
  (39, 'Bungoma',          'bungoma',          'Western'),
  (40, 'Busia',            'busia',            'Western'),
  (41, 'Siaya',            'siaya',            'Nyanza'),
  (42, 'Kisumu',           'kisumu',           'Nyanza'),
  (43, 'Homa Bay',         'homa-bay',         'Nyanza'),
  (44, 'Migori',           'migori',           'Nyanza'),
  (45, 'Kisii',            'kisii',            'Nyanza'),
  (46, 'Nyamira',          'nyamira',          'Nyanza'),
  (47, 'Nairobi City',     'nairobi',          'Nairobi')
on conflict (code) do nothing;

insert into public.experience_categories (slug, name, description, sort_order) values
  ('wildlife-safari',   'Wildlife & safari',   'Game drives, walking safaris, birding and conservation visits.', 10),
  ('culture-community', 'Culture & community', 'Community-run tourism, village visits, crafts and living heritage hosted by local people.', 20),
  ('food-culinary',     'Food & culinary',     'Cooking classes, market walks, farm visits and tastings.', 30),
  ('hiking-outdoors',   'Hiking & outdoors',   'Day hikes, mountain treks, forest walks and camping.', 40),
  ('beaches-coast',     'Beaches & coast',     'Snorkelling, dhow sailing, marine parks and coastal towns.', 50),
  ('adventure',         'Adventure',           'Cycling, climbing, rafting, ballooning and other active trips.', 60),
  ('arts-heritage',     'Arts & heritage',     'Museums, historic sites, architecture and contemporary art.', 70)
on conflict (slug) do nothing;
