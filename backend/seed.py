"""Mock seed data: a cluster of small rural communities and the kind of
specialized goods/services that make a 12-mile trip worth it - heirloom
seed, heavy equipment, craft labor and bulk regional trade - plus a few
everyday reclaimed materials (byproduct.'s roots).

Images are deliberately rare (text-first discovery). Every image that is
here has its real download size in image_size_kb, measured from the URL.
"""

from datetime import datetime, timedelta, timezone

# (key, name, lat, lng, approximate_population). Keys are only used below to
# wire items to communities - real ids are generated UUIDs.
COMMUNITIES = [
    ("oak", "Oak Valley", 44.000, -72.500, 640),
    ("willow", "Willow Bend", 44.025, -72.470, 310),
    ("pine", "Pine Ridge", 44.080, -72.430, 1180),
    ("maple", "Maple Hollow", 43.930, -72.590, 420),
    ("cedar", "Cedar Creek", 44.150, -72.640, 2100),
    ("stone", "Stone Ford", 43.840, -72.300, 860),
    ("birch", "Birch Flats", 44.230, -72.250, 3400),
]

_IMG_PRODUCE_CRATES = ("https://images.unsplash.com/photo-1757627550652-30788bfce978?w=400&h=300&fit=crop", 43)
_IMG_PALLETS = ("https://commons.wikimedia.org/wiki/Special:FilePath/Wooden-pallets%20stacked%207.jpg?width=400", 55)
_IMG_WINE_BARRELS = ("https://images.unsplash.com/photo-1639757664366-83a495f4a9d9?w=400&h=300&fit=crop", 33)
_IMG_BARREL_PLANTERS = ("https://images.unsplash.com/photo-1646419081436-b3ea1613accd?w=400&h=300&fit=crop", 28)
_IMG_BRICK = ("https://images.unsplash.com/photo-1632758821813-eb8248651745?w=400&h=300&fit=crop", 38)
_IMG_LUMBER = ("https://commons.wikimedia.org/wiki/Special:FilePath/Men%20stacking%20lumber%20at%20Seattle%20Cedar%20Lumber%20Manufacturing%20Company%2C%20ca1920%20(MOHAI%204377).jpg?width=400", 76)
_IMG_SCRAP_METAL = ("https://images.unsplash.com/photo-1679996287979-166522b96c39?w=400&h=300&fit=crop", 42)
_IMG_TRACTOR = ("https://commons.wikimedia.org/wiki/Special:FilePath/John%20Deere%20tractor.jpg?width=400", 78)

# (community key, category, title, description, price_or_exchange, owner,
#  contact email, quantity, tags, image, days ago)
ITEMS = [
    ("oak", "produce", "Farm-Fresh Eggs",
     "Pasture-raised, mixed browns and blues. Pick up at the farm stand by the red barn.",
     "$5/dozen or trade for layer feed", "Hilltop Hens", "hilltop@example.com",
     "10 dozen/week", "eggs,poultry,pasture", None, 1),
    ("willow", "produce", "Late-Season Tomato Crates",
     "Paste and slicer tomatoes, some split - perfect for sauce and canning.",
     "$12/crate or trade for mason jars", "Bend Market Garden", "bendgarden@example.com",
     "15 crates", "tomatoes,canning,sauce", _IMG_PRODUCE_CRATES, 2),
    ("willow", "general", "Seasoned Firewood",
     "Split maple and ash, dried two seasons. Delivery within Willow Bend.",
     "$220/cord", "Bend Market Garden", "bendgarden@example.com",
     "6 cords", "firewood,maple,ash,heating", None, 4),
    ("pine", "seeds", "Cherokee Trail of Tears Heirloom Beans",
     "Black pole beans saved for 30+ years from one family line. Excellent germination last spring.",
     "Free - trade for any heirloom seed", "Ridge Seed Library", "seedlibrary@example.com",
     "40 packets", "heirloom,beans,pole beans,seed saving", None, 3),
    ("pine", "heavy_tools", "Square Hay Baler (New Holland 316)",
     "Field-ready baler, recently re-tied knotters. Rent by the day; I'll show you how to run it.",
     "$150/day or trade for 50 bales", "Ridge Family Farm", "ridgefarm@example.com",
     "1 baler", "hay,baler,haying,equipment rental", None, 5),
    ("pine", "skills_services", "Traveling Farrier",
     "Trims and shoeing for horses, donkeys and mules. Covering Pine Ridge and anywhere within 25 mi.",
     "$45 trim / $140 full set", "Ridge Hoof Care", "hoofcare@example.com",
     None, "farrier,horses,hoof care", None, 6),
    ("maple", "produce", "Raw Wildflower Honey (Bulk)",
     "Unfiltered, from our 30 hives. Sold in 5-gallon buckets for bakeries, meaderies and co-ops.",
     "$260/bucket", "Hollow Apiary", "hollowbees@example.com",
     "8 buckets", "honey,bulk,bees,raw", None, 2),
    ("maple", "general", "Hardwood Shipping Pallets",
     "Heat-treated (HT stamped), good for fencing, compost bins or firewood racks.",
     "Free - you haul", "Hollow Feed & Supply", "hollowfeed@example.com",
     "60 pallets", "pallets,wood,reclaimed", _IMG_PALLETS, 8),
    ("maple", "general", "All-American Pressure Canner (Loan)",
     "41-quart canner, gauge tested this summer. Borrow for a weekend.",
     "Free loan - return with a jar of whatever you put up", "Hollow Grange", "grange@example.com",
     "1 canner", "canning,preserving,loan", None, 9),
    ("cedar", "heavy_tools", "Tractor with PTO Rototiller",
     "45 hp utility tractor with 6 ft tiller. Breaks new ground in an afternoon. Operator available.",
     "$200/day, or $60/hr with operator", "Creek Equipment Share", "creekequip@example.com",
     "1 tractor", "tractor,tiller,pto,equipment rental", _IMG_TRACTOR, 1),
    ("cedar", "seeds", "Rare Seed Potatoes",
     "Certified disease-free: Russian Banana fingerling, Magic Molly (purple), Kennebec.",
     "$3/lb or trade for garlic", "Cedar Root Cellar", "rootcellar@example.com",
     "300 lbs", "potatoes,seed potatoes,fingerling,heirloom", None, 3),
    ("cedar", "skills_services", "Blacksmith & Farm Welding Repair",
     "Broken hitches, gates, plow points, harrow tines. Mobile rig for field repairs.",
     "$55/hr or barter for hay", "Creek Forge", "creekforge@example.com",
     None, "blacksmith,welding,repair,mobile", None, 7),
    ("cedar", "general", "Used Oak Wine Barrels",
     "Retired from our cider house. Rain barrels, planters, aging your own vinegar.",
     "$60 each", "Cedar Creek Cidery", "cidery@example.com",
     "20 barrels", "barrels,oak,reclaimed", _IMG_WINE_BARRELS, 10),
    ("stone", "heavy_tools", "27-Ton Log Splitter",
     "Gas splitter, horizontal/vertical. Towable with a 2\" ball hitch.",
     "$75/day", "Ford Rentals", "fordrentals@example.com",
     "1 splitter", "log splitter,firewood,equipment rental", None, 2),
    ("stone", "seeds", "Open-Pollinated Heirloom Corn",
     "Bloody Butcher (dent) and Glass Gem (flint). Hand-selected ears, saved isolated from GMO corn.",
     "$4/packet or seed swap", "Stone Ford Seed Co-op", "fordseed@example.com",
     "60 packets", "corn,heirloom,open-pollinated,seed saving", None, 5),
    ("stone", "skills_services", "Timber Framing Crew",
     "Barns, sugar shacks, run-ins. Traditional pegged joinery, we can mill from your own logs.",
     "Quote per project", "Ford Timberworks", "timberworks@example.com",
     None, "timber framing,barns,carpentry", None, 12),
    ("stone", "general", "Half-Barrel Planters",
     "Cut and drilled for drainage, ready to fill.",
     "$35 each or trade for perennials", "Ford Timberworks", "timberworks@example.com",
     "12 planters", "planters,barrels,garden", _IMG_BARREL_PLANTERS, 6),
    ("birch", "heavy_tools", "Mini Excavator with Operator",
     "Ponds, drainage ditches, stump removal, foundation footings.",
     "$95/hr with operator", "Flats Excavation", "flatsdig@example.com",
     "1 excavator", "excavator,ponds,drainage,earthwork", None, 4),
    ("birch", "produce", "Bulk Feed Oats",
     "Cleaned oats from this year's harvest in 1-ton totes. Great for horses and poultry.",
     "$310/tote", "Flats Grain", "flatsgrain@example.com",
     "12 totes", "oats,feed,grain,bulk", None, 3),
    ("birch", "seeds", "Hardneck Seed Garlic",
     "Music and German White - big cloves, winter hardy. Plant by late October.",
     "$18/lb", "Flats Garlic Farm", "garlic@example.com",
     "80 lbs", "garlic,hardneck,seed garlic", None, 1),
    ("birch", "skills_services", "Portable Sawmill Service",
     "We bring a band mill to your logs - beams, boards, live-edge slabs.",
     "$90/hr or share of the lumber", "Flats Sawmill", "flatsmill@example.com",
     None, "sawmill,lumber,milling", _IMG_LUMBER, 8),
    ("birch", "skills_services", "Small Engine Repair",
     "Chainsaws, mowers, generators, snowblowers. Drop-off at the old service station.",
     "$40/hr + parts", "Flats Small Engine", "smallengine@example.com",
     None, "small engine,repair,chainsaw,generator", None, 11),
    ("birch", "general", "Reclaimed Clean Face Brick",
     "From a mill demolition. Mortar knocked off, palletized.",
     "$0.40/brick", "Flats Excavation", "flatsdig@example.com",
     "2,000 bricks", "brick,masonry,reclaimed", _IMG_BRICK, 14),
    ("cedar", "general", "Scrap Steel Offcuts",
     "Plate, angle and tube offcuts from the forge - good for welding projects.",
     "$0.25/lb", "Creek Forge", "creekforge@example.com",
     "800 lbs", "steel,scrap metal,welding", _IMG_SCRAP_METAL, 9),
]


def seed(db, Community, Item):
    """Insert communities and items if the database is empty."""
    if db.query(Community).count() > 0:
        return

    now = datetime.now(timezone.utc)
    by_key = {}
    for key, name, lat, lng, population in COMMUNITIES:
        community = Community(name=name, lat=lat, lng=lng, approximate_population=population)
        db.add(community)
        by_key[key] = community
    db.flush()

    for (key, category, title, description, price, owner, email,
         quantity, tags, image, days_ago) in ITEMS:
        db.add(Item(
            community_id=by_key[key].id,
            category=category,
            title=title,
            description=description,
            price_or_exchange=price,
            owner=owner,
            contact_email=email,
            quantity=quantity,
            tags=tags,
            image_url=image[0] if image else None,
            image_size_kb=image[1] if image else None,
            created_at=now - timedelta(days=days_ago),
        ))
    db.commit()
