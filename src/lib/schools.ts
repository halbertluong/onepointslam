export interface School {
  name: string;
  slug: string;
  primary: string;
  secondary: string;
  tier: 'd1' | 'd2' | 'd3';
  /** Team nickname, as it appears at the end of `name` — the "Pilots" of
   *  "University of Portland Pilots". Drives the default rally hashtag on
   *  marketing assets. Empty when the school's name carries no nickname. */
  mascot: string;
  /** False = colors are estimated or unverified; show manual-entry prompt */
  colorsVerified: boolean;
}

// D1 schools — official colors sourced from university brand guidelines
export const D1_SCHOOLS: School[] = [
  { name: 'Alabama Crimson Tide',          mascot: 'Crimson Tide',     slug: 'alabama',           primary: '#9E1B32', secondary: '#828A8F', tier: 'd1', colorsVerified: true },
  { name: 'Arizona State Sun Devils',      mascot: 'Sun Devils',       slug: 'arizona-state',     primary: '#8C1D40', secondary: '#FFC627', tier: 'd1', colorsVerified: true },
  { name: 'Arizona Wildcats',              mascot: 'Wildcats',         slug: 'arizona',           primary: '#003366', secondary: '#CC0033', tier: 'd1', colorsVerified: true },
  { name: 'Arkansas Razorbacks',           mascot: 'Razorbacks',       slug: 'arkansas',          primary: '#9D2235', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Auburn Tigers',                 mascot: 'Tigers',           slug: 'auburn',            primary: '#0C2340', secondary: '#E87722', tier: 'd1', colorsVerified: true },
  { name: 'Baylor Bears',                  mascot: 'Bears',            slug: 'baylor',            primary: '#154734', secondary: '#FFB81C', tier: 'd1', colorsVerified: true },
  { name: 'Boston College Eagles',         mascot: 'Eagles',           slug: 'boston-college',    primary: '#98002E', secondary: '#BC9B6A', tier: 'd1', colorsVerified: true },
  { name: 'Cal Bears',                     mascot: 'Bears',            slug: 'cal',               primary: '#003262', secondary: '#FDB515', tier: 'd1', colorsVerified: true },
  { name: 'Clemson Tigers',                mascot: 'Tigers',           slug: 'clemson',           primary: '#F66733', secondary: '#522D80', tier: 'd1', colorsVerified: true },
  { name: 'Colorado Buffaloes',            mascot: 'Buffaloes',        slug: 'colorado',          primary: '#CFB87C', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Duke Blue Devils',              mascot: 'Blue Devils',      slug: 'duke',              primary: '#003087', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Florida Gators',               mascot: 'Gators',           slug: 'florida',           primary: '#0021A5', secondary: '#FA4616', tier: 'd1', colorsVerified: true },
  { name: 'Florida State Seminoles',       mascot: 'Seminoles',        slug: 'florida-state',     primary: '#782F40', secondary: '#CEB888', tier: 'd1', colorsVerified: true },
  { name: 'Georgia Bulldogs',              mascot: 'Bulldogs',         slug: 'georgia',           primary: '#BA0C2F', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Georgia Tech Yellow Jackets',   mascot: 'Yellow Jackets',   slug: 'georgia-tech',      primary: '#B3A369', secondary: '#003057', tier: 'd1', colorsVerified: true },
  { name: 'Illinois Fighting Illini',      mascot: 'Fighting Illini',  slug: 'illinois',          primary: '#13294B', secondary: '#E84A27', tier: 'd1', colorsVerified: true },
  { name: 'Indiana Hoosiers',              mascot: 'Hoosiers',         slug: 'indiana',           primary: '#990000', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Iowa Hawkeyes',                 mascot: 'Hawkeyes',         slug: 'iowa',              primary: '#FFCD00', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Iowa State Cyclones',           mascot: 'Cyclones',         slug: 'iowa-state',        primary: '#C8102E', secondary: '#F1BE48', tier: 'd1', colorsVerified: true },
  { name: 'Kansas Jayhawks',               mascot: 'Jayhawks',         slug: 'kansas',            primary: '#0051A5', secondary: '#E8000D', tier: 'd1', colorsVerified: true },
  { name: 'Kansas State Wildcats',         mascot: 'Wildcats',         slug: 'kansas-state',      primary: '#512888', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Kentucky Wildcats',             mascot: 'Wildcats',         slug: 'kentucky',          primary: '#0033A0', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'LSU Tigers',                    mascot: 'Tigers',           slug: 'lsu',               primary: '#461D7C', secondary: '#FDD023', tier: 'd1', colorsVerified: true },
  { name: 'Louisville Cardinals',          mascot: 'Cardinals',        slug: 'louisville',        primary: '#AD0000', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Maryland Terrapins',            mascot: 'Terrapins',        slug: 'maryland',          primary: '#E03A3E', secondary: '#FFD520', tier: 'd1', colorsVerified: true },
  { name: 'Michigan Wolverines',           mascot: 'Wolverines',       slug: 'michigan',          primary: '#00274C', secondary: '#FFCB05', tier: 'd1', colorsVerified: true },
  { name: 'Michigan State Spartans',       mascot: 'Spartans',         slug: 'michigan-state',    primary: '#18453B', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Minnesota Golden Gophers',      mascot: 'Golden Gophers',   slug: 'minnesota',         primary: '#7A0019', secondary: '#FFB71B', tier: 'd1', colorsVerified: true },
  { name: 'Mississippi State Bulldogs',    mascot: 'Bulldogs',         slug: 'mississippi-state', primary: '#660000', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Missouri Tigers',               mascot: 'Tigers',           slug: 'missouri',          primary: '#F1B82D', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'NC State Wolfpack',             mascot: 'Wolfpack',         slug: 'nc-state',          primary: '#CC0000', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Nebraska Cornhuskers',          mascot: 'Cornhuskers',      slug: 'nebraska',          primary: '#E41C38', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'North Carolina Tar Heels',      mascot: 'Tar Heels',        slug: 'unc',               primary: '#4B9CD3', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Northwestern Wildcats',         mascot: 'Wildcats',         slug: 'northwestern',      primary: '#4E2A84', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Notre Dame Fighting Irish',     mascot: 'Fighting Irish',   slug: 'notre-dame',        primary: '#0C2340', secondary: '#AE9142', tier: 'd1', colorsVerified: true },
  { name: 'Ohio State Buckeyes',           mascot: 'Buckeyes',         slug: 'ohio-state',        primary: '#BB0000', secondary: '#666666', tier: 'd1', colorsVerified: true },
  { name: 'Oklahoma Sooners',              mascot: 'Sooners',          slug: 'oklahoma',          primary: '#841617', secondary: '#FDF9D8', tier: 'd1', colorsVerified: true },
  { name: 'Oklahoma State Cowboys',        mascot: 'Cowboys',          slug: 'oklahoma-state',    primary: '#FF6600', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Ole Miss Rebels',               mascot: 'Rebels',           slug: 'ole-miss',          primary: '#CE1126', secondary: '#00205B', tier: 'd1', colorsVerified: true },
  { name: 'Oregon Ducks',                  mascot: 'Ducks',            slug: 'oregon',            primary: '#154733', secondary: '#FEE123', tier: 'd1', colorsVerified: true },
  { name: 'Oregon State Beavers',          mascot: 'Beavers',          slug: 'oregon-state',      primary: '#DC4405', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Penn State Nittany Lions',      mascot: 'Nittany Lions',    slug: 'penn-state',        primary: '#041E42', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Pittsburgh Panthers',           mascot: 'Panthers',         slug: 'pittsburgh',        primary: '#003594', secondary: '#FFB81C', tier: 'd1', colorsVerified: true },
  { name: 'Purdue Boilermakers',           mascot: 'Boilermakers',     slug: 'purdue',            primary: '#CEB888', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Rutgers Scarlet Knights',       mascot: 'Scarlet Knights',  slug: 'rutgers',           primary: '#CC0033', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'South Carolina Gamecocks',      mascot: 'Gamecocks',        slug: 'south-carolina',    primary: '#73000A', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Stanford Cardinal',             mascot: 'Cardinal',         slug: 'stanford',          primary: '#8C1515', secondary: '#B6B1A9', tier: 'd1', colorsVerified: true },
  { name: 'Syracuse Orange',               mascot: 'Orange',           slug: 'syracuse',          primary: '#F76900', secondary: '#000E54', tier: 'd1', colorsVerified: true },
  { name: 'TCU Horned Frogs',              mascot: 'Horned Frogs',     slug: 'tcu',               primary: '#4D1979', secondary: '#A3A9AC', tier: 'd1', colorsVerified: true },
  { name: 'Tennessee Volunteers',          mascot: 'Volunteers',       slug: 'tennessee',         primary: '#FF8200', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Texas A&M Aggies',              mascot: 'Aggies',           slug: 'texas-am',          primary: '#500000', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Texas Longhorns',               mascot: 'Longhorns',        slug: 'texas',             primary: '#BF5700', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Texas Tech Red Raiders',        mascot: 'Red Raiders',      slug: 'texas-tech',        primary: '#CC0000', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'UCLA Bruins',                   mascot: 'Bruins',           slug: 'ucla',              primary: '#2D68C4', secondary: '#F2A900', tier: 'd1', colorsVerified: true },
  { name: 'USC Trojans',                   mascot: 'Trojans',          slug: 'usc',               primary: '#990000', secondary: '#FFC72C', tier: 'd1', colorsVerified: true },
  { name: 'Utah Utes',                     mascot: 'Utes',             slug: 'utah',              primary: '#CC0000', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Vanderbilt Commodores',         mascot: 'Commodores',       slug: 'vanderbilt',        primary: '#866D4B', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Virginia Cavaliers',            mascot: 'Cavaliers',        slug: 'virginia',          primary: '#232D4B', secondary: '#E57200', tier: 'd1', colorsVerified: true },
  { name: 'Virginia Tech Hokies',          mascot: 'Hokies',           slug: 'virginia-tech',     primary: '#75091D', secondary: '#CF4420', tier: 'd1', colorsVerified: true },
  { name: 'Wake Forest Demon Deacons',     mascot: 'Demon Deacons',    slug: 'wake-forest',       primary: '#9E7E38', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Washington Huskies',            mascot: 'Huskies',          slug: 'washington',        primary: '#33006F', secondary: '#E8D3A2', tier: 'd1', colorsVerified: true },
  { name: 'Washington State Cougars',      mascot: 'Cougars',          slug: 'washington-state',  primary: '#981E32', secondary: '#5E6A71', tier: 'd1', colorsVerified: true },
  { name: 'Wisconsin Badgers',             mascot: 'Badgers',          slug: 'wisconsin',         primary: '#C5050C', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  // Additional D1 programs
  { name: 'BYU Cougars',                   mascot: 'Cougars',          slug: 'byu',               primary: '#002E5D', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Cincinnati Bearcats',           mascot: 'Bearcats',         slug: 'cincinnati',        primary: '#E00122', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'Colorado State Rams',           mascot: 'Rams',             slug: 'colorado-state',    primary: '#1E4D2B', secondary: '#C8C372', tier: 'd1', colorsVerified: true },
  { name: 'Connecticut Huskies',           mascot: 'Huskies',          slug: 'uconn',             primary: '#000E2F', secondary: '#E4002B', tier: 'd1', colorsVerified: true },
  { name: 'Dayton Flyers',                 mascot: 'Flyers',           slug: 'dayton',            primary: '#CE1141', secondary: '#0A1942', tier: 'd1', colorsVerified: true },
  { name: 'DePaul Blue Demons',            mascot: 'Blue Demons',      slug: 'depaul',            primary: '#005587', secondary: '#E4002B', tier: 'd1', colorsVerified: true },
  { name: 'Georgetown Hoyas',              mascot: 'Hoyas',            slug: 'georgetown',        primary: '#041E42', secondary: '#8D817B', tier: 'd1', colorsVerified: true },
  { name: 'Gonzaga Bulldogs',              mascot: 'Bulldogs',         slug: 'gonzaga',           primary: '#002469', secondary: '#CC0000', tier: 'd1', colorsVerified: true },
  { name: 'Hawaii Warriors',               mascot: 'Warriors',         slug: 'hawaii',            primary: '#024731', secondary: '#C8AA76', tier: 'd1', colorsVerified: true },
  { name: 'Houston Cougars',               mascot: 'Cougars',          slug: 'houston',           primary: '#C8102E', secondary: '#63666A', tier: 'd1', colorsVerified: true },
  { name: 'Marquette Golden Eagles',       mascot: 'Golden Eagles',    slug: 'marquette',         primary: '#003366', secondary: '#FFCC00', tier: 'd1', colorsVerified: true },
  { name: 'Memphis Tigers',                mascot: 'Tigers',           slug: 'memphis',           primary: '#003087', secondary: '#898D8D', tier: 'd1', colorsVerified: true },
  { name: 'Miami Hurricanes',              mascot: 'Hurricanes',       slug: 'miami',             primary: '#005030', secondary: '#F47321', tier: 'd1', colorsVerified: true },
  { name: 'Providence Friars',             mascot: 'Friars',           slug: 'providence',        primary: '#002147', secondary: '#75B2DD', tier: 'd1', colorsVerified: true },
  { name: 'Saint Louis Billikens',         mascot: 'Billikens',        slug: 'saint-louis',       primary: '#003DA5', secondary: '#9EA2A2', tier: 'd1', colorsVerified: true },
  { name: 'San Diego State Aztecs',        mascot: 'Aztecs',           slug: 'sdsu',              primary: '#A6192E', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'SMU Mustangs',                  mascot: 'Mustangs',         slug: 'smu',               primary: '#354CA1', secondary: '#CC0035', tier: 'd1', colorsVerified: true },
  { name: 'UC Santa Barbara Gauchos',      mascot: 'Gauchos',          slug: 'ucsb',              primary: '#003660', secondary: '#FEBC11', tier: 'd1', colorsVerified: true },
  { name: 'UNLV Runnin\' Rebels',          mascot: 'Runnin\' Rebels',  slug: 'unlv',              primary: '#CE1141', secondary: '#808080', tier: 'd1', colorsVerified: true },
  { name: 'Villanova Wildcats',            mascot: 'Wildcats',         slug: 'villanova',         primary: '#00205B', secondary: '#009BDE', tier: 'd1', colorsVerified: true },
  { name: 'Xavier Musketeers',             mascot: 'Musketeers',       slug: 'xavier',            primary: '#002651', secondary: '#9E9C99', tier: 'd1', colorsVerified: true },
  { name: 'University of Portland Pilots', mascot: 'Pilots',           slug: 'portland',          primary: '#4B2E83', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Pepperdine Waves',              mascot: 'Waves',            slug: 'pepperdine',        primary: '#0C3B8C', secondary: '#FF7300', tier: 'd1', colorsVerified: true },
  { name: 'Santa Clara Broncos',           mascot: 'Broncos',          slug: 'santa-clara',       primary: '#862633', secondary: '#FFFFFF', tier: 'd1', colorsVerified: true },
  { name: 'Loyola Marymount Lions',        mascot: 'Lions',            slug: 'lmu',               primary: '#00205B', secondary: '#69B3E7', tier: 'd1', colorsVerified: true },
  { name: 'San Francisco Dons',            mascot: 'Dons',             slug: 'usf',               primary: '#004B87', secondary: '#CBA135', tier: 'd1', colorsVerified: true },
  { name: 'Pacific Tigers',                mascot: 'Tigers',           slug: 'pacific',           primary: '#F05523', secondary: '#000000', tier: 'd1', colorsVerified: true },
  { name: 'St. Mary\'s Gaels',             mascot: 'Gaels',            slug: 'saint-marys',       primary: '#013A81', secondary: '#BC151A', tier: 'd1', colorsVerified: true },
  { name: 'Fresno State Bulldogs',         mascot: 'Bulldogs',         slug: 'fresno-state',      primary: '#CC0033', secondary: '#002244', tier: 'd1', colorsVerified: true },
  { name: 'UC Davis Aggies',               mascot: 'Aggies',           slug: 'uc-davis',          primary: '#002855', secondary: '#B3A369', tier: 'd1', colorsVerified: true },
  { name: 'UC Irvine Anteaters',           mascot: 'Anteaters',        slug: 'uc-irvine',         primary: '#0064A4', secondary: '#FFD200', tier: 'd1', colorsVerified: true },
  { name: 'Utah State Aggies',             mascot: 'Aggies',           slug: 'utah-state',        primary: '#003263', secondary: '#8A8D8F', tier: 'd1', colorsVerified: true },
  { name: 'Boise State Broncos',           mascot: 'Broncos',          slug: 'boise-state',       primary: '#D64309', secondary: '#0033A0', tier: 'd1', colorsVerified: true },
  { name: 'New Mexico Lobos',              mascot: 'Lobos',            slug: 'new-mexico',        primary: '#BA0C2F', secondary: '#63666A', tier: 'd1', colorsVerified: true },
  { name: 'Wyoming Cowboys',               mascot: 'Cowboys',          slug: 'wyoming',           primary: '#492F24', secondary: '#FFC425', tier: 'd1', colorsVerified: true },
  { name: 'Air Force Falcons',             mascot: 'Falcons',          slug: 'air-force',         primary: '#003087', secondary: '#8A8D8F', tier: 'd1', colorsVerified: true },
  { name: 'Army Black Knights',            mascot: 'Black Knights',    slug: 'army',              primary: '#000000', secondary: '#D4B483', tier: 'd1', colorsVerified: true },
  { name: 'Navy Midshipmen',               mascot: 'Midshipmen',       slug: 'navy',              primary: '#00205B', secondary: '#B3A369', tier: 'd1', colorsVerified: true },
];

// D2 schools — major programs with verifiable colors
export const D2_SCHOOLS: School[] = [
  { name: 'Adelphi Panthers',              mascot: 'Panthers',         slug: 'adelphi',           primary: '#7B0D1E', secondary: '#D4AF37', tier: 'd2', colorsVerified: true },
  { name: 'Barry Buccaneers',              mascot: 'Buccaneers',       slug: 'barry',             primary: '#C41230', secondary: '#000000', tier: 'd2', colorsVerified: true },
  { name: 'Bellarmine Knights',            mascot: 'Knights',          slug: 'bellarmine',        primary: '#C8102E', secondary: '#000000', tier: 'd2', colorsVerified: true },
  { name: 'Cal Poly Pomona Broncos',       mascot: 'Broncos',          slug: 'cal-poly-pomona',   primary: '#006633', secondary: '#FFD700', tier: 'd2', colorsVerified: true },
  { name: 'California Baptist Lancers',    mascot: 'Lancers',          slug: 'cal-baptist',       primary: '#003087', secondary: '#FFCC00', tier: 'd2', colorsVerified: true },
  { name: 'Carson-Newman Eagles',          mascot: 'Eagles',           slug: 'carson-newman',     primary: '#F77F00', secondary: '#003087', tier: 'd2', colorsVerified: true },
  { name: 'Chico State Wildcats',          mascot: 'Wildcats',         slug: 'chico-state',       primary: '#CC0000', secondary: '#FFFFFF', tier: 'd2', colorsVerified: true },
  { name: 'Colorado Mesa Mavericks',       mascot: 'Mavericks',        slug: 'colorado-mesa',     primary: '#003366', secondary: '#FFC72C', tier: 'd2', colorsVerified: true },
  { name: 'Concordia-Irvine Eagles',       mascot: 'Eagles',           slug: 'concordia-irvine',  primary: '#002A5C', secondary: '#F7A11A', tier: 'd2', colorsVerified: true },
  { name: 'Dominican University of CA',    mascot: '',                 slug: 'dominican-ca',      primary: '#003087', secondary: '#C8A951', tier: 'd2', colorsVerified: true },
  { name: 'Drury Panthers',                mascot: 'Panthers',         slug: 'drury',             primary: '#003087', secondary: '#C41230', tier: 'd2', colorsVerified: true },
  { name: 'Embry-Riddle Eagles',           mascot: 'Eagles',           slug: 'embry-riddle',      primary: '#003087', secondary: '#FFCC00', tier: 'd2', colorsVerified: true },
  { name: 'Flagler Saints',                mascot: 'Saints',           slug: 'flagler',           primary: '#C8102E', secondary: '#000000', tier: 'd2', colorsVerified: true },
  { name: 'Florida Southern Moccasins',    mascot: 'Moccasins',        slug: 'florida-southern',  primary: '#003087', secondary: '#A80000', tier: 'd2', colorsVerified: true },
  { name: 'Grand Canyon Antelopes',        mascot: 'Antelopes',        slug: 'grand-canyon',      primary: '#522398', secondary: '#A57C2A', tier: 'd2', colorsVerified: true },
  { name: 'Humboldt State Lumberjacks',    mascot: 'Lumberjacks',      slug: 'humboldt',          primary: '#006633', secondary: '#FFD700', tier: 'd2', colorsVerified: true },
  { name: 'Lynn Fighting Knights',         mascot: 'Fighting Knights', slug: 'lynn',              primary: '#003087', secondary: '#FFCC00', tier: 'd2', colorsVerified: true },
  { name: 'Nova Southeastern Sharks',      mascot: 'Sharks',           slug: 'nova-southeastern', primary: '#003087', secondary: '#6CB4E4', tier: 'd2', colorsVerified: true },
  { name: 'Rollins Tars',                  mascot: 'Tars',             slug: 'rollins',           primary: '#003087', secondary: '#C8A951', tier: 'd2', colorsVerified: true },
  { name: 'Saint Leo Lions',               mascot: 'Lions',            slug: 'saint-leo',         primary: '#660099', secondary: '#FFCC00', tier: 'd2', colorsVerified: true },
  { name: 'Tampa Spartans',                mascot: 'Spartans',         slug: 'tampa',             primary: '#990000', secondary: '#C8A951', tier: 'd2', colorsVerified: true },
  { name: 'UC San Diego Tritons',          mascot: 'Tritons',          slug: 'ucsd',              primary: '#00629B', secondary: '#FFD700', tier: 'd2', colorsVerified: true },
  { name: 'West Florida Argonauts',        mascot: 'Argonauts',        slug: 'west-florida',      primary: '#003087', secondary: '#C8A951', tier: 'd2', colorsVerified: true },
  { name: 'Western Washington Vikings',    mascot: 'Vikings',          slug: 'western-washington', primary: '#003087', secondary: '#C41230', tier: 'd2', colorsVerified: true },
  { name: 'Wingate Bulldogs',              mascot: 'Bulldogs',         slug: 'wingate',           primary: '#003087', secondary: '#C8A951', tier: 'd2', colorsVerified: true },
];

// D3 schools — major programs with verifiable colors
export const D3_SCHOOLS: School[] = [
  { name: 'Amherst Mammoths',              mascot: 'Mammoths',         slug: 'amherst',           primary: '#3F1F69', secondary: '#FFFFFF', tier: 'd3', colorsVerified: true },
  { name: 'Bowdoin Polar Bears',           mascot: 'Polar Bears',      slug: 'bowdoin',           primary: '#000000', secondary: '#FFFFFF', tier: 'd3', colorsVerified: true },
  { name: 'Bates Bobcats',                 mascot: 'Bobcats',          slug: 'bates',             primary: '#860038', secondary: '#FFFFFF', tier: 'd3', colorsVerified: true },
  { name: 'Brandeis Judges',               mascot: 'Judges',           slug: 'brandeis',          primary: '#003478', secondary: '#FFFFFF', tier: 'd3', colorsVerified: true },
  { name: 'Carnegie Mellon Tartans',       mascot: 'Tartans',          slug: 'carnegie-mellon',   primary: '#C41230', secondary: '#3D3D3D', tier: 'd3', colorsVerified: true },
  { name: 'Case Western Spartans',         mascot: 'Spartans',         slug: 'case-western',      primary: '#003B71', secondary: '#6CACE4', tier: 'd3', colorsVerified: true },
  { name: 'Claremont-Mudd-Scripps Stags',  mascot: 'Stags',            slug: 'cms',               primary: '#7C2529', secondary: '#CCCCCC', tier: 'd3', colorsVerified: true },
  { name: 'Colby White Mules',             mascot: 'White Mules',      slug: 'colby',             primary: '#003366', secondary: '#C0C0C0', tier: 'd3', colorsVerified: true },
  { name: 'Emory Eagles',                  mascot: 'Eagles',           slug: 'emory',             primary: '#012169', secondary: '#F2A900', tier: 'd3', colorsVerified: true },
  { name: 'Haverford Fords',               mascot: 'Fords',            slug: 'haverford',         primary: '#003087', secondary: '#FFFFFF', tier: 'd3', colorsVerified: true },
  { name: 'Johns Hopkins Blue Jays',       mascot: 'Blue Jays',        slug: 'johns-hopkins',     primary: '#002D72', secondary: '#68ACE5', tier: 'd3', colorsVerified: true },
  { name: 'Kenyon Lords',                  mascot: 'Lords',            slug: 'kenyon',            primary: '#4A154B', secondary: '#C8A951', tier: 'd3', colorsVerified: true },
  { name: 'Middlebury Panthers',           mascot: 'Panthers',         slug: 'middlebury',        primary: '#003087', secondary: '#FFFFFF', tier: 'd3', colorsVerified: true },
  { name: 'MIT Engineers',                 mascot: 'Engineers',        slug: 'mit',               primary: '#8A0000', secondary: '#C2C0BF', tier: 'd3', colorsVerified: true },
  { name: 'Pomona-Pitzer Sagehens',        mascot: 'Sagehens',         slug: 'pomona-pitzer',     primary: '#003087', secondary: '#FECC00', tier: 'd3', colorsVerified: true },
  { name: 'Swarthmore Garnet',             mascot: 'Garnet',           slug: 'swarthmore',        primary: '#8B0000', secondary: '#FFFFFF', tier: 'd3', colorsVerified: true },
  { name: 'Trinity Bantams',               mascot: 'Bantams',          slug: 'trinity-ct',        primary: '#003087', secondary: '#C8A951', tier: 'd3', colorsVerified: true },
  { name: 'Tufts Jumbos',                  mascot: 'Jumbos',           slug: 'tufts',             primary: '#3E8EDE', secondary: '#4B306A', tier: 'd3', colorsVerified: true },
  { name: 'UC Santa Cruz Banana Slugs',    mascot: 'Banana Slugs',     slug: 'uc-santa-cruz',     primary: '#003C6C', secondary: '#FDC700', tier: 'd3', colorsVerified: true },
  { name: 'University of Chicago Maroons', mascot: 'Maroons',          slug: 'uchicago',          primary: '#800000', secondary: '#BDBEC0', tier: 'd3', colorsVerified: true },
  { name: 'Washington and Lee Generals',   mascot: 'Generals',         slug: 'wlu',               primary: '#003087', secondary: '#C41230', tier: 'd3', colorsVerified: true },
  { name: 'Washington University Bears',   mascot: 'Bears',            slug: 'washu',             primary: '#990000', secondary: '#BFBFBF', tier: 'd3', colorsVerified: true },
  { name: 'Wesleyan Cardinals',            mascot: 'Cardinals',        slug: 'wesleyan',          primary: '#C41230', secondary: '#000000', tier: 'd3', colorsVerified: true },
  { name: 'Williams Ephs',                 mascot: 'Ephs',             slug: 'williams',          primary: '#512698', secondary: '#FFD700', tier: 'd3', colorsVerified: true },
];

export const ALL_SCHOOLS: School[] = [...D1_SCHOOLS, ...D2_SCHOOLS, ...D3_SCHOOLS];

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@onepointbowl.com';
export const SUGGEST_CORRECTION_URL =
  `mailto:${SUPPORT_EMAIL}?subject=School%20Color%20Correction&body=School%20name%3A%0APrimary%20color%20(hex)%3A%0ASecondary%20color%20(hex)%3A%0ASource%3A`;

/** Every hashtag on a marketing asset carries the platform tag alongside the school's. */
export const PLATFORM_HASHTAG = '#OnePointBowl';

/**
 * The school a tenant belongs to, matched by display name.
 *
 * Picking a school in team settings sets the display name to `<school> Tennis`,
 * so the school's name survives inside whatever the director later renames the
 * team to ("University of Portland Pilots Tennis - Women's"). Longest match
 * wins, so "Washington University Bears" isn't beaten by "Washington Huskies".
 */
export function findSchoolByName(tenantName: string | null | undefined): School | null {
  if (!tenantName) return null;
  const haystack = tenantName.toLowerCase();
  return ALL_SCHOOLS
    .filter((s) => haystack.includes(s.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

/** "Pilots" -> "#GoPilots". Punctuation and spaces come out: "Runnin' Rebels" -> "#GoRunninRebels". */
export function mascotHashtag(mascot: string | null | undefined): string {
  const cleaned = (mascot ?? '').replace(/[^A-Za-z0-9]/g, '');
  return cleaned ? `#Go${cleaned}` : '';
}

/**
 * The hashtag line a tournament's assets start with: the school's rally tag
 * plus the platform tag, or just the platform tag when the team isn't one of
 * the schools we know.
 */
export function defaultHashtags(tenantName: string | null | undefined): string {
  const rally = mascotHashtag(findSchoolByName(tenantName)?.mascot);
  return rally ? `${rally} ${PLATFORM_HASHTAG}` : PLATFORM_HASHTAG;
}
