// Shared vocabulary for what a facility treats. Keys match scripts/build-hospital-dataset.mjs.

export const SPECIALTIES = {
  emergency: { label: 'Emergency / casualty', keywords: ['emergency', 'casualty', 'accident'] },
  trauma: { label: 'Trauma care', keywords: ['trauma', 'fracture', 'road accident', 'fall', 'injury', 'chot'] },
  icu: { label: 'ICU / critical care', keywords: ['icu', 'ventilator', 'critical'] },
  primary_care: { label: 'Primary care', keywords: ['checkup', 'check-up', 'bp check'] },
  general_medicine: { label: 'General medicine', keywords: ['fever', 'bukhar', 'cold', 'cough', 'khansi', 'weakness', 'diabetes', 'sugar', 'bp', 'blood pressure', 'typhoid', 'dengue', 'malaria', 'vomiting', 'loose motion', 'dast'] },
  general_surgery: { label: 'General surgery', keywords: ['surgery', 'operation', 'hernia', 'appendix', 'gallbladder', 'pathri', 'stone', 'piles'] },
  maternity: { label: 'Maternity & gynaecology', keywords: ['pregnan', 'delivery', 'period', 'gyn', 'labour', 'labor', 'garbh', 'bachcha hone'] },
  paediatrics: { label: 'Child care (paediatrics)', keywords: ['child', 'baby', 'infant', 'bachcha', 'bacche', 'newborn', 'kid'] },
  orthopaedics: { label: 'Bones & joints (orthopaedics)', keywords: ['bone', 'joint', 'knee', 'back pain', 'kamar', 'ghutna', 'haddi', 'fracture', 'spine', 'shoulder'] },
  cardiology: { label: 'Heart (cardiology)', keywords: ['heart', 'dil', 'palpitation', 'cardiac', 'ecg', 'angiography'] },
  ophthalmology: { label: 'Eyes (ophthalmology)', keywords: ['eye', 'aankh', 'vision', 'cataract', 'motiyabind', 'spectacle'] },
  ent: { label: 'Ear, nose & throat', keywords: ['ear', 'kaan', 'nose', 'naak', 'throat', 'gala', 'tonsil', 'sinus', 'hearing'] },
  gastroenterology: { label: 'Stomach & liver (gastro)', keywords: ['stomach', 'pet', 'liver', 'acidity', 'gastric', 'jaundice', 'piliya'] },
  neurology: { label: 'Brain & nerves (neurology)', keywords: ['migraine', 'headache', 'sir dard', 'seizure', 'fits', 'numbness', 'paralysis'] },
  dental: { label: 'Dental', keywords: ['tooth', 'teeth', 'daant', 'dental', 'gum'] },
  pulmonology: { label: 'Chest & lungs', keywords: ['asthma', 'breathing', 'lungs', 'tb', 'tuberculosis', 'chest infection', 'allergy'] },
  psychiatry: { label: 'Mental health', keywords: ['anxiety', 'depression', 'stress', 'sleep', 'mental'] },
  dermatology: { label: 'Skin (dermatology)', keywords: ['skin', 'rash', 'itch', 'khujli', 'acne', 'pimple', 'allergy on skin'] },
  physiotherapy: { label: 'Physiotherapy', keywords: ['physio', 'rehab', 'stiffness'] },
  oncology: { label: 'Cancer care', keywords: ['cancer', 'tumour', 'tumor', 'chemo'] },
  vaccination: { label: 'Vaccination', keywords: ['vaccine', 'vaccination', 'tika', 'immunisation', 'immunization'] },
} as const

export type SpecialtyKey = keyof typeof SPECIALTIES
export const SPECIALTY_KEYS = Object.keys(SPECIALTIES) as SpecialtyKey[]

export function isSpecialtyKey(value: unknown): value is SpecialtyKey {
  return typeof value === 'string' && value in SPECIALTIES
}

/** Where a facility's claim to treat something comes from, strongest first. */
export const EVIDENCE = {
  hospital_verified: { label: 'Confirmed by hospital', weight: 2 },
  osm_tag: { label: 'Listed on OpenStreetMap', weight: 1 },
  name_inference: { label: 'From facility name', weight: 1 },
  facility_level_norm: { label: 'Expected for this facility level', weight: 0.5 },
} as const
export type EvidenceSource = keyof typeof EVIDENCE

export const FACILITY_TYPES = {
  medical_college: { label: 'Government medical college', tier: 5 },
  district_hospital: { label: 'District hospital', tier: 4 },
  sub_district_hospital: { label: 'Sub-district hospital', tier: 3 },
  hospital: { label: 'Hospital', tier: 2 },
  chc: { label: 'Community health centre', tier: 2 },
  polyclinic: { label: 'Polyclinic', tier: 1 },
  uhc: { label: 'Urban health centre', tier: 1 },
  phc: { label: 'Primary health centre', tier: 1 },
  dispensary: { label: 'Dispensary', tier: 1 },
  clinic: { label: 'Clinic', tier: 1 },
} as const
export type FacilityType = keyof typeof FACILITY_TYPES
