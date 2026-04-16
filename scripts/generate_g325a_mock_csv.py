"""
Generate a mock CSV database for the USCIS G-325A form in form_catalog/immigration.

Headers are the raw PDF AcroForm field names (full hierarchical paths) as they
currently exist in form_catalog/immigration/g-325a__g-325a.pdf. Three rows of
fully populated data for Justin Thakral, Daniel Gin, and Anthony Liclone.

Run: python3 scripts/generate_g325a_mock_csv.py
Output: quickTestFiles/g325a_mock.csv
"""

from __future__ import annotations

import csv
from pathlib import Path

from pypdf import PdfReader

REPO_ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = REPO_ROOT / "form_catalog" / "immigration" / "g-325a__g-325a.pdf"
OUT_PATH = REPO_ROOT / "quickTestFiles" / "g325a_mock.csv"


# Per-person biographic data. Each dict drives the value lookup below.
PEOPLE = [
    {
        "family": "Thakral",
        "given": "Justin",
        "middle": "Rohit",
        "dob": "02/14/1990",
        "citizenship": "India",
        "sex": "M",
        "a_number": "123456789",
        "ssn": "123-45-6789",
        "elis": "ELIS1000123456",
        "city_county_birth": "Mumbai, Maharashtra",
        "current_addr": {
            "street": "742 Mission St",
            "unit_kind": "apt",  # apt | ste | flr
            "unit_number": "5B",
            "city": "San Francisco",
            "state": "CA",
            "zip": "94103",
            "from": "01/15/2022",
            "to": "PRESENT",
        },
        "mailing_addr": {
            "in_care_of": "Maya Thakral",
            "street": "742 Mission St",
            "unit_kind": "apt",
            "unit_number": "5B",
            "city": "San Francisco",
            "state": "CA",
            "zip": "94103",
        },
        "other_names": [
            ("Thakral", "Jay", "R"),
            ("Thakral", "JT", "R"),
            ("Thakral", "Justin", "Roh"),
        ],
        "father": {
            "family": "Thakral",
            "given": "Rohit",
            "dob": "06/11/1962",
            "city_country_birth": "Pune, India",
            "city_country_residence": "Pune, India",
        },
        "mother": {
            "family": "Thakral",
            "given": "Anika",
            "dob": "09/22/1965",
            "city_country_birth": "Mumbai, India",
            "city_country_residence": "Pune, India",
        },
        "spouse": {
            "family": "Patel",
            "given": "Riya",
            "dob": "07/19/1991",
            "city_country_birth": "Ahmedabad, India",
            "marriage_date": "04/12/2019",
            "marriage_place": "San Francisco, CA, USA",
        },
        "residence_history": [
            {
                "street": "742 Mission St",
                "city": "San Francisco",
                "state": "CA",
                "zip": "94103",
                "country": "USA",
                "from": "01/2022",
                "to": "PRESENT",
            },
            {
                "street": "1500 Broadway",
                "city": "Oakland",
                "state": "CA",
                "zip": "94612",
                "country": "USA",
                "from": "06/2018",
                "to": "12/2021",
            },
            {
                "street": "88 Park Ave",
                "city": "Palo Alto",
                "state": "CA",
                "zip": "94301",
                "country": "USA",
                "from": "08/2015",
                "to": "05/2018",
            },
            {
                "street": "12 MG Road",
                "city": "Pune",
                "state": "Maharashtra",
                "zip": "411001",
                "country": "India",
                "from": "01/2010",
                "to": "07/2015",
            },
        ],
        "annual_income": "145000",
        "annual_expenses": "72000",
        "assets_value": "320000",
        "finances_explanation": "Steady software engineering salary with modest stock grants and index fund holdings.",
        "applicant_phone": "415-555-0101",
        "applicant_mobile": "415-555-0102",
        "applicant_email": "justin.thakral@example.com",
        "applicant_signature": "Justin R. Thakral",
        "signature_date": "04/10/2026",
        "purpose": "Adjustment of status to lawful permanent resident",
        "interpreter": {
            "family": "Sharma",
            "given": "Vikram",
            "business": "BayArea Language Services LLC",
            "phone": "415-555-0201",
            "mobile": "415-555-0202",
            "email": "vikram.sharma@example.com",
            "language": "Hindi",
            "signature": "Vikram Sharma",
            "signature_date": "04/10/2026",
        },
        "preparer": {
            "family": "Okafor",
            "given": "Chidinma",
            "business": "Golden Gate Immigration Counsel",
            "phone": "415-555-0301",
            "fax": "415-555-0302",
            "email": "chidinma.okafor@example.com",
            "signature": "Chidinma Okafor",
            "signature_date": "04/10/2026",
        },
        "additional_info": [
            ("3", "Part 1", "Item 1.a", "Applicant uses nickname Jay professionally."),
            ("3", "Part 1", "Item 10", "Additional other names listed in family archives."),
            ("4", "Part 2", "Item 6", "ELIS account created 2022."),
            ("5", "Part 3", "Item 2d", "Assets include retirement account and index funds."),
        ],
    },
    {
        "family": "Gin",
        "given": "Daniel",
        "middle": "Wei",
        "dob": "07/22/1988",
        "citizenship": "China",
        "sex": "M",
        "a_number": "234567890",
        "ssn": "234-56-7890",
        "elis": "ELIS1000234567",
        "city_county_birth": "Guangzhou, Guangdong",
        "current_addr": {
            "street": "555 California St",
            "unit_kind": "ste",
            "unit_number": "200",
            "city": "San Francisco",
            "state": "CA",
            "zip": "94104",
            "from": "03/01/2021",
            "to": "PRESENT",
        },
        "mailing_addr": {
            "in_care_of": "Daniel Gin",
            "street": "555 California St",
            "unit_kind": "ste",
            "unit_number": "200",
            "city": "San Francisco",
            "state": "CA",
            "zip": "94104",
        },
        "other_names": [
            ("Gin", "Dan", "W"),
            ("Gin", "Danny", "W"),
            ("Jin", "Wei", "Da"),
        ],
        "father": {
            "family": "Gin",
            "given": "Hao",
            "dob": "03/05/1960",
            "city_country_birth": "Guangzhou, China",
            "city_country_residence": "Guangzhou, China",
        },
        "mother": {
            "family": "Gin",
            "given": "Mei",
            "dob": "11/18/1963",
            "city_country_birth": "Shenzhen, China",
            "city_country_residence": "Guangzhou, China",
        },
        "spouse": {
            "family": "Lin",
            "given": "Emily",
            "dob": "02/08/1990",
            "city_country_birth": "Taipei, Taiwan",
            "marriage_date": "10/05/2017",
            "marriage_place": "San Jose, CA, USA",
        },
        "residence_history": [
            {
                "street": "555 California St",
                "city": "San Francisco",
                "state": "CA",
                "zip": "94104",
                "country": "USA",
                "from": "03/2021",
                "to": "PRESENT",
            },
            {
                "street": "320 Castro St",
                "city": "Mountain View",
                "state": "CA",
                "zip": "94041",
                "country": "USA",
                "from": "05/2016",
                "to": "02/2021",
            },
            {
                "street": "1201 Arch St",
                "city": "Philadelphia",
                "state": "PA",
                "zip": "19107",
                "country": "USA",
                "from": "08/2012",
                "to": "04/2016",
            },
            {
                "street": "88 Tianhe Rd",
                "city": "Guangzhou",
                "state": "Guangdong",
                "zip": "510620",
                "country": "China",
                "from": "01/2006",
                "to": "07/2012",
            },
        ],
        "annual_income": "165000",
        "annual_expenses": "80000",
        "assets_value": "410000",
        "finances_explanation": "Product manager income with RSUs vested across four years and a joint savings account.",
        "applicant_phone": "415-555-0401",
        "applicant_mobile": "415-555-0402",
        "applicant_email": "daniel.gin@example.com",
        "applicant_signature": "Daniel W. Gin",
        "signature_date": "04/10/2026",
        "purpose": "Adjustment of status to lawful permanent resident",
        "interpreter": {
            "family": "Chen",
            "given": "Li",
            "business": "Pacific Interpretation Services",
            "phone": "415-555-0501",
            "mobile": "415-555-0502",
            "email": "li.chen@example.com",
            "language": "Mandarin",
            "signature": "Li Chen",
            "signature_date": "04/10/2026",
        },
        "preparer": {
            "family": "Nguyen",
            "given": "Hoa",
            "business": "Bay Bridge Immigration Partners",
            "phone": "415-555-0601",
            "fax": "415-555-0602",
            "email": "hoa.nguyen@example.com",
            "signature": "Hoa Nguyen",
            "signature_date": "04/10/2026",
        },
        "additional_info": [
            ("3", "Part 1", "Item 1.a", "Daniel also romanized his name as Jin Wei on school records in China."),
            ("4", "Part 2", "Item 6", "ELIS account created when OPT EAD was requested."),
            ("5", "Part 3", "Item 2c", "Assets include brokerage account, Roth IRA, and index funds."),
            ("5", "Part 3", "Item 2d", "No inherited assets or trust income."),
        ],
    },
    {
        "family": "Liclone",
        "given": "Anthony",
        "middle": "Joseph",
        "dob": "11/08/1992",
        "citizenship": "Philippines",
        "sex": "M",
        "a_number": "345678901",
        "ssn": "345-67-8901",
        "elis": "ELIS1000345678",
        "city_county_birth": "Quezon City, Metro Manila",
        "current_addr": {
            "street": "100 Market St",
            "unit_kind": "flr",
            "unit_number": "12",
            "city": "San Francisco",
            "state": "CA",
            "zip": "94105",
            "from": "09/01/2023",
            "to": "PRESENT",
        },
        "mailing_addr": {
            "in_care_of": "Anthony Liclone",
            "street": "PO Box 4421",
            "unit_kind": "ste",
            "unit_number": "4421",
            "city": "San Francisco",
            "state": "CA",
            "zip": "94142",
        },
        "other_names": [
            ("Liclone", "Tony", "J"),
            ("Liclone", "Ant", "J"),
            ("Liclone", "Anton", "Jose"),
        ],
        "father": {
            "family": "Liclone",
            "given": "Ramon",
            "dob": "05/30/1965",
            "city_country_birth": "Manila, Philippines",
            "city_country_residence": "Quezon City, Philippines",
        },
        "mother": {
            "family": "Liclone",
            "given": "Maria",
            "dob": "08/14/1967",
            "city_country_birth": "Cebu City, Philippines",
            "city_country_residence": "Quezon City, Philippines",
        },
        "spouse": {
            "family": "Santos",
            "given": "Angelica",
            "dob": "12/02/1993",
            "city_country_birth": "Makati, Philippines",
            "marriage_date": "06/18/2021",
            "marriage_place": "Daly City, CA, USA",
        },
        "residence_history": [
            {
                "street": "100 Market St",
                "city": "San Francisco",
                "state": "CA",
                "zip": "94105",
                "country": "USA",
                "from": "09/2023",
                "to": "PRESENT",
            },
            {
                "street": "6550 Mission St",
                "city": "Daly City",
                "state": "CA",
                "zip": "94014",
                "country": "USA",
                "from": "06/2020",
                "to": "08/2023",
            },
            {
                "street": "2201 SW 152nd St",
                "city": "Seattle",
                "state": "WA",
                "zip": "98166",
                "country": "USA",
                "from": "01/2017",
                "to": "05/2020",
            },
            {
                "street": "21 Katipunan Ave",
                "city": "Quezon City",
                "state": "Metro Manila",
                "zip": "1108",
                "country": "Philippines",
                "from": "08/2010",
                "to": "12/2016",
            },
        ],
        "annual_income": "128000",
        "annual_expenses": "68000",
        "assets_value": "210000",
        "finances_explanation": "Registered nurse salary with overtime differential, modest 401(k), and emergency savings.",
        "applicant_phone": "415-555-0701",
        "applicant_mobile": "415-555-0702",
        "applicant_email": "anthony.liclone@example.com",
        "applicant_signature": "Anthony J. Liclone",
        "signature_date": "04/10/2026",
        "purpose": "Adjustment of status to lawful permanent resident",
        "interpreter": {
            "family": "Reyes",
            "given": "Marisol",
            "business": "Pacific Rim Translations Inc",
            "phone": "415-555-0801",
            "mobile": "415-555-0802",
            "email": "marisol.reyes@example.com",
            "language": "Tagalog",
            "signature": "Marisol Reyes",
            "signature_date": "04/10/2026",
        },
        "preparer": {
            "family": "Alvarez",
            "given": "Diego",
            "business": "West Coast Immigration Advocates",
            "phone": "415-555-0901",
            "fax": "415-555-0902",
            "email": "diego.alvarez@example.com",
            "signature": "Diego Alvarez",
            "signature_date": "04/10/2026",
        },
        "additional_info": [
            ("3", "Part 1", "Item 1.a", "Anthony also known as Tony Liclone throughout nursing career."),
            ("4", "Part 2", "Item 6", "ELIS account created during H-1B transfer."),
            ("5", "Part 3", "Item 2a", "Annual income includes overtime and shift differential pay."),
            ("5", "Part 3", "Item 2d", "Savings earmarked for nursing graduate program tuition."),
        ],
    },
]


def value_for_field(field_name: str, person: dict) -> str:
    """Return the mock value for a given raw PDF field name for one person."""

    curr = person["current_addr"]
    mail = person["mailing_addr"]
    father = person["father"]
    mother = person["mother"]
    spouse = person["spouse"]
    history = person["residence_history"]
    interpreter = person["interpreter"]
    preparer = person["preparer"]
    addl = person["additional_info"]

    # --- Part 1, Line 1: Applicant's full legal name (appears on page 1 and
    # repeated on the overflow "additional information" page). ---
    if "P1_Line1_FamilyName" in field_name:
        return person["family"]
    if "P1_Line1_GivenName" in field_name:
        return person["given"]
    if "P1_Line1_MiddleName" in field_name:
        return person["middle"]

    # --- Part 1, Line 2: Current physical address. ---
    if "P1_Line2_StreetNumberName" in field_name:
        return curr["street"]
    if "P1_Line2_Unit[0]" in field_name:  # Apt radio
        return "true" if curr["unit_kind"] == "apt" else "false"
    if "P1_Line2_Unit[1]" in field_name:  # Ste radio
        return "true" if curr["unit_kind"] == "ste" else "false"
    if "P1_Line2_Unit[2]" in field_name:  # Flr radio
        return "true" if curr["unit_kind"] == "flr" else "false"
    if "P1_Line2_AptSteFlrNumber" in field_name:
        return curr["unit_number"]
    if "P1_Line2_CityTown" in field_name:
        return curr["city"]
    if "P1_Line2_State" in field_name:
        return curr["state"]
    if "P1_Line2_ZipCode" in field_name:
        return curr["zip"]
    if "P1_Line2_DateFrom" in field_name:
        return curr["from"]
    if "P1_Line2_DateTo" in field_name:
        return curr["to"]

    # --- Part 1, Line 3: Mailing address (same structure + in-care-of). ---
    if "P1_Line3_InCareofName" in field_name:
        return mail["in_care_of"]
    if "P1_Line3_StreetNumberName" in field_name:
        return mail["street"]
    if "P1_Line3_Unit[0]" in field_name:
        return "true" if mail["unit_kind"] == "apt" else "false"
    if "P1_Line3_Unit[1]" in field_name:
        return "true" if mail["unit_kind"] == "ste" else "false"
    if "P1_Line3_Unit[2]" in field_name:
        return "true" if mail["unit_kind"] == "flr" else "false"
    if "P1_Line3_AptSteFlrNumber" in field_name:
        return mail["unit_number"]
    if "P1_Line3_CityTown" in field_name:
        return mail["city"]
    if "P1_Line3_State" in field_name:
        return mail["state"]
    if "P1_Line3_ZipCode" in field_name:
        return mail["zip"]

    # --- Part 1, Line 4: Date of birth (repeated on pages 1-4). ---
    if "P1_Line4_DateOfBirth" in field_name:
        return person["dob"]

    # --- Part 1, Line 5: Country of citizenship (repeated multiple times). ---
    if "P1_Line5_CountryOfCitizenship" in field_name:
        return person["citizenship"]

    # --- Part 1, Line 6: Sex radio buttons (Male / Female). ---
    if "P1_Line6_Sex[0]" in field_name:
        return "true" if person["sex"] == "M" else "false"
    if "P1_Line6_Sex[1]" in field_name:
        return "true" if person["sex"] == "F" else "false"

    # --- Part 1, Line 9: A-Number (repeated on overflow page). ---
    if "P1_Line9_AlienNumber" in field_name:
        return person["a_number"]

    # --- Part 1, Line 10: Other names used (3 rows of Family/Given/Middle). ---
    if "P1_Line10_FamilyName1" in field_name:
        return person["other_names"][0][0]
    if "P1_Line10_GivenName1" in field_name:
        return person["other_names"][0][1]
    if "P1_Line10_MiddleName1" in field_name:
        return person["other_names"][0][2]
    if "P1_Line10_FamilyName2" in field_name:
        return person["other_names"][1][0]
    if "P1_Line10_GivenName2" in field_name:
        return person["other_names"][1][1]
    if "P1_Line10_MiddleName2" in field_name:
        return person["other_names"][1][2]
    if "P1_Line10_FamilyName3" in field_name:
        return person["other_names"][2][0]
    if "P1_Line10_GivenName3" in field_name:
        return person["other_names"][2][1]
    if "P1_Line10_MiddleName3" in field_name:
        return person["other_names"][2][2]

    # --- Part 1, Line 11: City/County of birth. ---
    if "P1_Line11_CityCountyOfBirth" in field_name:
        return person["city_county_birth"]

    # --- Parents (Line 13-16). Index [0] = father, [1] = mother. ---
    if "P1_Line13_FamilyName[0]" in field_name:
        return father["family"]
    if "P1_Line13_GivenName[0]" in field_name:
        return father["given"]
    if "P1_Line14_DateOfBirth[0]" in field_name:
        return father["dob"]
    if "P1_Line15_CityCountryOfBirth[0]" in field_name:
        return father["city_country_birth"]
    if "P1_Line13_FamilyName[1]" in field_name:
        return mother["family"]
    if "P1_Line13_GivenName[1]" in field_name:
        return mother["given"]
    if "P1_Line14_DateOfBirth[1]" in field_name:
        return mother["dob"]
    if "P1_Line15_CityCountryOfBirth[1]" in field_name:
        return mother["city_country_birth"]

    # Line 16 current residence has 6 slots — first 3 for father, last 3 for mother.
    if "P1_Line16_CityCountryOfResidence[0]" in field_name:
        return father["city_country_residence"]
    if "P1_Line16_CityCountryOfResidence[1]" in field_name:
        return father["city_country_residence"]
    if "P1_Line16_CityCountryOfResidence[2]" in field_name:
        return father["city_country_residence"]
    if "P1_Line16_CityCountryOfResidence[3]" in field_name:
        return mother["city_country_residence"]
    if "P1_Line16_CityCountryOfResidence[4]" in field_name:
        return mother["city_country_residence"]
    if "P1_Line16_CityCountryOfResidence[5]" in field_name:
        return mother["city_country_residence"]

    # --- Spouse (Line 21-25). ---
    if "P1_Line21_FamilyName" in field_name:
        return spouse["family"]
    if "P1_Line21_GivenName" in field_name:
        return spouse["given"]
    if "P1_Line22_DateOfBirth" in field_name:
        return spouse["dob"]
    if "P1_Line23_CityCountryOfBirth" in field_name:
        return spouse["city_country_birth"]
    if "P1_Line24_DateOfMarriage" in field_name:
        return spouse["marriage_date"]
    if "P1_Line25_PlaceOfMarriage" in field_name:
        return spouse["marriage_place"]

    # --- Line 26: Residence history (up to 4 rows). ---
    for idx in range(1, 5):
        row = history[idx - 1]
        if f"P1_Line26_StreetandNumber_{idx}" in field_name:
            return row["street"]
        if f"P1_Line26_City_{idx}" in field_name:
            return row["city"]
        if f"P1_Line26_ProvinceorState_{idx}" in field_name:
            return row["state"]
        if f"P1_Line26_ZIPPostalCode_{idx}" in field_name:
            return row["zip"]
        if f"P1_Line26_Country_{idx}" in field_name:
            return row["country"]
        if f"P1_Line26_MonthFrom_{idx}" in field_name:
            return row["from"]
        if f"P1_Line26_MonthTo_{idx}" in field_name:
            return row["to"]

    # --- Part 2: ELIS + disclosure checkboxes. ---
    if "P2_Line6_USCISELISAcctNumber" in field_name:
        return person["elis"]
    # P2_CB are top-level "did/did not apply" radios — affirm first option.
    if "P2_CB[0]" in field_name:
        return "true"
    if "P2_CB[1]" in field_name:
        return "false"
    # P2_2_CB[0..7] — granular sub-checkboxes. First one checked, rest unchecked.
    if "P2_2_CB[0]" in field_name:
        return "true"
    if field_name.split(".")[-1].startswith("P2_2_CB["):
        return "false"

    # --- Part 3: Financial disclosure. ---
    if "P3_Line2a_AnnualIncome" in field_name:
        return person["annual_income"]
    if "P3_Line2b_CurrentAnnualExp" in field_name:
        return person["annual_expenses"]
    if "P3_Line2c_AssestTotalValue" in field_name:
        return person["assets_value"]
    if "P3_Line2d_Explanation" in field_name:
        return person["finances_explanation"]

    # --- Part 4: SSN. P4_CB1 is the "I have an SSN" yes/no radio. ---
    if "P4_CB1[0]" in field_name:
        return "true"
    if "P4_CB1[1]" in field_name:
        return "false"
    if "P4_Line2_SSN" in field_name:
        return person["ssn"]

    # --- Line 2 Yes/No radio (appears in two places — e.g. "ever applied for ..."). ---
    if "Line2_Yes1" in field_name:
        return "true"
    if "Line2_No1" in field_name:
        return "false"

    # --- Purpose narrative (Line 1a). ---
    if "Line1a_Purpose" in field_name:
        return person["purpose"]

    # --- Part 12: Applicant contact block + signature. ---
    if "Pt12Line5_DaytimePhoneNumber" in field_name:
        return person["applicant_phone"]
    if "Pt12Line6_MobileNumber1" in field_name:
        return person["applicant_mobile"]
    if "Pt12Line7_Email" in field_name:
        return person["applicant_email"]
    if "Pt12Line8_Signature" in field_name:
        return person["applicant_signature"]
    if "Pt13Line8_DateofSignature" in field_name:
        return person["signature_date"]

    # --- Part 12/13 interpreter block. ---
    if "Pt13Line1_InterpreterFamilyName" in field_name:
        return interpreter["family"]
    if "Pt13Line1_InterpreterGivenName" in field_name:
        return interpreter["given"]
    if "Pt13Line2_InterpreterBusinessorOrg" in field_name:
        return interpreter["business"]
    if "Pt12Line4_InterpreterDaytimeTelephone" in field_name:
        return interpreter["phone"]
    if "Pt12Line5_InterpreterMobileTelephone" in field_name:
        return interpreter["mobile"]
    if "Pt12Line5_Email" in field_name:
        return interpreter["email"]
    if "Pt12_NameofLanguage" in field_name:
        return interpreter["language"]
    # Interpreter signature is in subform[5] index [0]; preparer signature
    # is the same short name at index [1]. Route by the bracket on the path.
    if "Pt12Line6_Signature[0]" in field_name:
        return interpreter["signature"]
    if "Pt12Line6_DateofSignature[0]" in field_name:
        return interpreter["signature_date"]
    if "Pt12Line6_Signature[1]" in field_name:
        return preparer["signature"]
    if "Pt12Line6_DateofSignature[1]" in field_name:
        return preparer["signature_date"]

    # --- Part 13 preparer block. ---
    if "Pt13Line1_PreparerFamilyName" in field_name:
        return preparer["family"]
    if "Pt13Line1_PreparerGivenName" in field_name:
        return preparer["given"]
    if "Pt13Line2_BusinessName" in field_name:
        return preparer["business"]
    if "Pt13Line4_DaytimePhoneNumber1" in field_name:
        return preparer["phone"]
    if "Pt13ine5_PreparerFaxNumber" in field_name:
        return preparer["fax"]
    if "Pt13Line6_Email" in field_name:
        return preparer["email"]

    # --- Part 8: Additional information overflow rows (3-6). ---
    for i, line in enumerate(("Pt8Line3", "Pt8Line4", "Pt8Line5", "Pt8Line6")):
        row = addl[i]
        if f"{line}_PageNumber" in field_name:
            return row[0]
        if f"{line}_PartNumber" in field_name:
            return row[1]
        if f"{line}_ItemNumber" in field_name:
            return row[2]
        if f"{line}_AdditionalInfo" in field_name:
            return row[3]

    # --- Page-level repeated fields on each rendered page: TextField1 is a
    # header A-Number label, PDF417BarCode1 is a 2D barcode payload that USCIS
    # regenerates from the other fields (placeholder here). ---
    if field_name.split(".")[-1].startswith("TextField1"):
        return f"A{person['a_number']}"
    if field_name.split(".")[-1].startswith("PDF417BarCode1"):
        return "BARCODE_PLACEHOLDER"

    return ""


def main() -> None:
    reader = PdfReader(str(PDF_PATH))
    fields = reader.get_fields() or {}
    leaf_fields = [
        name for name, field in fields.items()
        if field.get("/FT") in ("/Tx", "/Btn", "/Ch")
    ]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as fp:
        writer = csv.writer(fp)
        writer.writerow(leaf_fields)
        for person in PEOPLE:
            writer.writerow([value_for_field(name, person) for name in leaf_fields])

    print(f"Wrote {OUT_PATH.relative_to(REPO_ROOT)}")
    print(f"  {len(leaf_fields)} columns, {len(PEOPLE)} rows")

    # Quick unfilled sanity check — warn if any column is entirely empty.
    with OUT_PATH.open(newline="", encoding="utf-8") as fp:
        rows = list(csv.DictReader(fp))
    empty_cols = [col for col in rows[0].keys() if all(not r[col] for r in rows)]
    if empty_cols:
        print(f"WARNING: {len(empty_cols)} columns are empty for every person:")
        for col in empty_cols:
            print(f"  - {col}")


if __name__ == "__main__":
    main()
