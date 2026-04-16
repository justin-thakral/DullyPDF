#!/usr/bin/env node
/**
 * Audit the hosted form catalog for low-value entries, then optionally prune
 * them from disk and catalog metadata.
 *
 * The audit is intentionally conservative and only removes forms that match at
 * least one explicit rule:
 * - non-English variants of otherwise covered English workflows
 * - exact duplicate PDFs, keeping one canonical copy
 * - obvious internal/admin artifacts (checklists, status reports, tab sheets)
 *
 * Default mode is dry-run:
 *   node scripts/prune-form-catalog-low-value.mjs
 *
 * Scope to one or more sections:
 *   node scripts/prune-form-catalog-low-value.mjs --section tax_business
 *
 * Write mode deletes matching assets and updates manifest/descriptions/cache:
 *   node scripts/prune-form-catalog-low-value.mjs --write --section tax_business
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const MANIFEST_PATH = resolve(ROOT, 'form_catalog/manifest.json');
const PAGE_COUNTS_PATH = resolve(ROOT, 'form_catalog/page_counts.json');
const DESCRIPTIONS_PATH = resolve(ROOT, 'form_catalog/descriptions.json');
const TITLE_OVERRIDES_PATH = resolve(ROOT, 'form_catalog/title_overrides.json');
const CATALOG_ROOT = resolve(ROOT, 'form_catalog');

const LANGUAGE_PATTERNS = [
  /\bspanish\b/i,
  /\bchinese\b/i,
  /\barabic\b/i,
  /\bfrench\b/i,
  /\bgerman\b/i,
  /\bitalian\b/i,
  /\bjapanese\b/i,
  /\bkorean\b/i,
  /\bportuguese\b/i,
  /\bpolish\b/i,
  /\brussian\b/i,
  /\bturkish\b/i,
  /\bdutch\b/i,
  /\bvietnamese\b/i,
  /\bcreole\b/i,
  /\bthai\b/i,
  /\bgreek\b/i,
  /\btagalog\b/i,
];

const LOW_VALUE_FILE_KEYS = new Set([
  'customs_logistics/cbp_1300__cbp_form_1300.pdf',
  'customs_logistics/cbp_1303__cbp_form_1303.pdf',
  'customs_logistics/cbp_1304__CBP_Form_1304.pdf',
  'customs_logistics/cbp_214a__cbp_form_214a.pdf',
  'customs_logistics/cbp_214b__CBP_Form_214B.pdf',
  'customs_logistics/cbp_214c__CBP_Form_214C.pdf',
  'customs_logistics/cbp_216__cbp_form_216.pdf',
  'customs_logistics/cbp_226__cbp_form_226.pdf',
  'customs_logistics/cbp_247__cbp_form_247_0.pdf',
  'customs_logistics/cbp_262__cbp_form_262.pdf',
  'customs_logistics/cbp_300__cbp_form_300.pdf',
  'customs_logistics/cbp_301a__CBP_Form_301A.pdf',
  'customs_logistics/cbp_3173__cbp_form_3173.pdf',
  'customs_logistics/cbp_3229__cbp_form_3229.pdf',
  'customs_logistics/cbp_3347__CBP_Form_3347.pdf',
  'customs_logistics/cbp_3347a__CBP_Form_3347A.pdf',
  'customs_logistics/cbp_3348__cbp_form_3348.pdf',
  'customs_logistics/cbp_339a__cbp_form_339a.pdf',
  'customs_logistics/cbp_339c__cbp_form_339c.pdf',
  'customs_logistics/cbp_339v__cbp_form_339v.pdf',
  'customs_logistics/cbp_341__CBP_Form_341.pdf',
  'customs_logistics/cbp_349__cbp_form_349.pdf',
  'customs_logistics/cbp_3495__cbp_form_3495.pdf',
  'customs_logistics/cbp_3499__CBP_Form_3499.pdf',
  'customs_logistics/cbp_350__cbp_form_350.pdf',
  'customs_logistics/cbp_400__cbp_form_400.pdf',
  'customs_logistics/cbp_401__cbp_form_401.pdf',
  'customs_logistics/cbp_434__CBP_Form_434.pdf',
  'customs_logistics/cbp_446__cbp_form_446.pdf',
  'customs_logistics/cbp_447__cbp_form_447.pdf',
  'customs_logistics/cbp_450__cbp_form_450.pdf',
  'customs_logistics/cbp_5297__CBP_Form_5297.pdf',
  'customs_logistics/cbp_7501a__cbp_form_7501a.pdf',
  'healthcare/cms-802__cms802.pdf',
  'real_estate_housing/1044.pdf',
  'real_estate_housing/11600.pdf',
  'real_estate_housing/11601.pdf',
  'real_estate_housing/171.pdf',
  'real_estate_housing/20.pdf',
  'real_estate_housing/200-2.pdf',
  'real_estate_housing/21010.pdf',
  'real_estate_housing/21012.pdf',
  'real_estate_housing/21016.pdf',
  'real_estate_housing/21023.pdf',
  'real_estate_housing/21027.pdf',
  'real_estate_housing/24.pdf',
  'real_estate_housing/25018.pdf',
  'real_estate_housing/25019.pdf',
  'real_estate_housing/25031.pdf',
  'real_estate_housing/25229.pdf',
  'real_estate_housing/26.pdf',
  'real_estate_housing/27.pdf',
  'real_estate_housing/4056.pdf',
  'real_estate_housing/57.pdf',
  'real_estate_housing/80.pdf',
  'real_estate_housing/80-b.pdf',
  'real_estate_housing/80a.pdf',
  'real_estate_housing/81.pdf',
  'real_estate_housing/doc_22543.pdf',
  'real_estate_housing/doc_22544.pdf',
  'real_estate_housing/doc_22545.pdf',
  'real_estate_housing/doc_22546.pdf',
  'real_estate_housing/doc_22548.pdf',
  'real_estate_housing/doc_22550.pdf',
  'real_estate_housing/doc_22551.pdf',
  'real_estate_housing/doc_35483.pdf',
  'real_estate_housing/doc_35499.pdf',
  'real_estate_housing/doc_35503.pdf',
  'real_estate_housing/1012.pdf',
  'real_estate_housing/1044-c.pdf',
  'real_estate_housing/1044-g.pdf',
  'real_estate_housing/20000-a.pdf',
  'real_estate_housing/21005.pdf',
  'real_estate_housing/21007.pdf',
  'real_estate_housing/21007a.pdf',
  'real_estate_housing/21019.pdf',
  'real_estate_housing/22b.pdf',
  'real_estate_housing/2453.1-ca.pdf',
  'real_estate_housing/25007.pdf',
  'real_estate_housing/27027.pdf',
  'real_estate_housing/27045.pdf',
  'real_estate_housing/27056.pdf',
  'real_estate_housing/2726.pdf',
  'real_estate_housing/2995.pdf',
  'real_estate_housing/30002.pdf',
  'real_estate_housing/30007.pdf',
  'real_estate_housing/30013.pdf',
  'real_estate_housing/30014.pdf',
  'real_estate_housing/30015.pdf',
  'real_estate_housing/40119.pdf',
  'real_estate_housing/40150.pdf',
  'real_estate_housing/40151.pdf',
  'real_estate_housing/40152.pdf',
  'real_estate_housing/40153.pdf',
  'real_estate_housing/40154.pdf',
  'real_estate_housing/40155.pdf',
  'real_estate_housing/40156.pdf',
  'real_estate_housing/40157.pdf',
  'real_estate_housing/40158.pdf',
  'real_estate_housing/40159.pdf',
  'real_estate_housing/40161.pdf',
  'real_estate_housing/40162.pdf',
  'real_estate_housing/40163.pdf',
  'real_estate_housing/40164.pdf',
  'real_estate_housing/40206.pdf',
  'real_estate_housing/50080ecrp.pdf',
  'real_estate_housing/50080rse.pdf',
  'real_estate_housing/50080rsf.pdf',
  'real_estate_housing/50080scr.pdf',
  'real_estate_housing/52570.pdf',
  'real_estate_housing/52570-a.pdf',
  'real_estate_housing/52734-a.pdf',
  'real_estate_housing/52734-b.pdf',
  'real_estate_housing/52734-c.pdf',
  'real_estate_housing/52780.pdf',
  'real_estate_housing/52832.pdf',
  'real_estate_housing/54118.pdf',
  'real_estate_housing/80-c.pdf',
  'real_estate_housing/8059.pdf',
  'real_estate_housing/90003.pdf',
  'real_estate_housing/90167-ca.pdf',
  'real_estate_housing/90172aca.pdf',
  'real_estate_housing/90172bca.pdf',
  'real_estate_housing/90173aca.pdf',
  'real_estate_housing/90173bca.pdf',
  'real_estate_housing/92403-ca.pdf',
  'real_estate_housing/92403-eh.pdf',
  'real_estate_housing/92432.1-ca.pdf',
  'real_estate_housing/92442-ca.pdf',
  'real_estate_housing/92442aca.pdf',
  'real_estate_housing/92450-ca.pdf',
  'real_estate_housing/92457am.pdf',
  'real_estate_housing/92457m.pdf',
  'real_estate_housing/92466r4.pdf',
  'real_estate_housing/93481.pdf',
  'real_estate_housing/93566.1-ca.pdf',
  'real_estate_housing/96011.pdf',
  'real_estate_housing/96013.pdf',
  'real_estate_housing/96015.pdf',
  'real_estate_housing/9832.pdf',
  'small_business/sba_form_2219-oa__inv_nmvc_sba2219_3.pdf',
  'small_business/sba_form_2303-504__Form_2303_504_Closing_Checklist_for_Complete_File_Review_9.12.14new1_3.pdf',
  'small_business/sba_form_269-financial__forms_mis269_3.pdf',
  'small_business/sba_form_272-federal__inv_nmvc_sf272_3.pdf',
  'small_business/sba_form_25-llgp__SBA_Form_25_LLGP_OMB_Ext_07-31-2027_.pdf',
  'small_business/sba_form_25-pc__SBA_Form_25_PC_OMB_Ext_07-31-2027_.pdf',
  'small_business/sba_form_25-pcgp__SBA_Form_25_PCGP_OMB_Ext_07-31-2027_.pdf',
  'small_business/sba_form_33-authorization__SBA_Form_33_OMB_Ext_07-31-2027_.pdf',
  'small_business/sba_form_34-bank__SBA_Form_34_Bank_ID_OMB_Ext_07-31-2027_.pdf',
  'small_business/sba_form__503-504_Liquidation_Wrap_Up_Report.pdf',
  'small_business/sba_form__CDC_Quarterly_Status_Report.pdf',
  'small_business/sba_form__Debit_Authorization_7-5-24_FINAL_.pdf',
  'small_business/sba_form__Match_Certification_of_Cash_Match_Prog_Inc_-_For_Annual_Budget_-_Revised_4.pdf',
  'small_business/sba_form__Subordination_Worksheet.pdf',
  'small_business/sba_form__Transfer2520Participation_2__0.pdf',
  'small_business/sba_form_care-preservation__CPCTabs_508_box_08-13-2025.pdf',
  'small_business/sba_form_1065-applicant__SBA_Form_1065_3.pdf',
  'small_business/sba_form_1050-settlement__3245-0200SBAForm1050-R.pdf',
  'small_business/sba_form_1010-nho__SBA_Form_1010_NHO_new_-_SBA_Updated_Expiration_Date.pdf',
  'small_business/sba_form_1010b-ait__SBA_Form_1010_AIT_new_-_SBA_Updated_Expiration_Date.pdf',
  'small_business/sba_form_1010b-anc__SBA_Form_1010_ANC_new_-_SBA_Updated_Expiration_Date.pdf',
  'small_business/sba_form_1010b-cdc__SBA_1010_CDC_new_-_SBA_Updated_Expiration_Date.pdf',
  'small_business/sba_form_1010b-ind__SBA_Form_1010_IND_2017_New_3.pdf',
  'small_business/sba_form_1405-stockholders__SBA_Form_1405e_Review_3.pdf',
  'small_business/sba_form_1405a-ownership__SBA_Form_1405A.pdf',
  'small_business/sba_form_1454-application__SBA_Form_1454.pdf',
  'small_business/sba_form_1505-note__SBA_1505.pdf',
  'small_business/sba_form_160-resolution__SBA_Form_160-508.pdf',
  'small_business/sba_form_1790-representatives__SBA_1790_4.pdf',
  'small_business/sba_form_1926-sba__SBA_Form_1926_6.pdf',
  'small_business/sba_form_2113-program__SBA_2113_508_compliant_1_.pdf',
  'small_business/sba_form_2233-premier__SBA_Form_2233-508.pdf',
  'small_business/sba_form_2234-part__Form_2234.pdf',
  'small_business/sba_form_2234-part__Form_2234A_-_Technical_Corrections_-_01.2018_0.pdf',
  'small_business/sba_form_2301-community__SBA_Form_2301_FINAL_with_links-508.pdf',
  'small_business/sba_form_2402-form__SBA_Form_2402_09-17_.pdf',
  'small_business/sba_form_2408-hubzone__SBA_Form_2408_3.pdf',
  'small_business/sba_form_2424-supplemental__SBA_2424-508.pdf',
  'small_business/sba_form_2450-504__SBA_Form_2450__04-18_2_.pdf',
  'small_business/sba_form_2464-annual__Form_2464_-_Annual_Franchisor_Certification_-_01.18.2018.pdf',
  'small_business/sba_form_3881-ach__SF_3881_4.pdf',
  'small_business/sba_form_2484-lender__LenderApplication2484ARPrevisions_final_3-18-21_-508.pdf',
  'small_business/sba_form_2484-sd__LenderApplication2484SDARPrevisions_final_3-18-21_-508.pdf',
  'small_business/sba_form_2534-7a__SBAForm2534_3__0.pdf',
  'small_business/sba_form_3173-restaurant__3245-0424_SBA_Form_3173.pdf',
  'small_business/sba_form_424b-assurances__SF_424b__Assurances_Non_Construction_Programs_5.pdf',
  'small_business/sba_form_480-size__SBA_Form_480_exp_8-31-2026_.pdf',
  'small_business/sba_form_641-us__SBA-641_2_.pdf',
  'small_business/sba_form_652-assurance__SBA_652_1_.pdf',
  'small_business/sba_form_723-certification__form_cont723_3.pdf',
  'small_business/sba_form_856-disclosure__SBA_Form_856_7-31-15_0_3.pdf',
  'small_business/sba_form_856a-disclosure__SBA_Form_856A_7-31-15_0_6.pdf',
  'small_business/sba_form_857-request__SBA_Form_857_02-29-16_WorkingC_5_508.pdf',
  'small_business/sba_form_888-management__SBA-888_2_.pdf',
  'small_business/sba_form_1149-lenders__SBA_Form_1149.pdf',
  'small_business/sba_form_2237-7a__SBAForm2237.pdf',
  'small_business/sba_form_offer-compromise__OICTabs-508_0_0.pdf',
  'small_business/sba_form_resolution-team__Resolution_Req_Letter_.pdf',
  'small_business/sba_form_sba-charge__SBA_Charge_Off_Tabs.pdf',
  'small_business/sba_form_2461-quarterly__SBA_Form_2461_1_.pdf',
  'small_business/sba_form_2462-addendum__Form_2462_-_Addendum_to_Franchise_Agreement_0.pdf',
  'small_business/sba_form_arc-loan__ARC_Liqudation_form__7.pdf',
  'small_business/sba_form_authorization-grant__Authorization_Release_Grant_of_Materials-508.pdf',
  'small_business/sba_form_sba-assignment__AsgnmntRvsd022220.pdf',
  'small_business/sba_form_lender-certification__3245-0415_SBA_Form_3512_PPP_Lender_Cert_for_Error_Corrections_and_Reinstatements_3-8-2022-508.pdf',
]);

const SECOND_PASS_LOW_VALUE_FILE_KEYS = new Set([
  // 2026-04 second pass: prune the lowest-signal HUD operations, staff/admin,
  // program-reporting, and checklist artifacts that still leaked through the
  // catalog. These are explicit keys so the prune remains reproducible as the
  // upstream HUD inventory changes.
  'real_estate_housing/21b.pdf',
  'real_estate_housing/22-a.pdf',
  'real_estate_housing/23.pdf',
  'real_estate_housing/33.pdf',
  'real_estate_housing/58.pdf',
  'real_estate_housing/58-a.pdf',
  'real_estate_housing/143.pdf',
  'real_estate_housing/154.pdf',
  'real_estate_housing/158.pdf',
  'real_estate_housing/185.pdf',
  'real_estate_housing/216.pdf',
  'real_estate_housing/221.pdf',
  'real_estate_housing/235.pdf',
  'real_estate_housing/235.1.pdf',
  'real_estate_housing/289.pdf',
  'real_estate_housing/557.pdf',
  'real_estate_housing/582.pdf',
  'real_estate_housing/698.pdf',
  'real_estate_housing/732.pdf',
  'real_estate_housing/735.pdf',
  'real_estate_housing/822.pdf',
  'real_estate_housing/836.pdf',
  'real_estate_housing/853.pdf',
  'real_estate_housing/1013.pdf',
  'real_estate_housing/1026.pdf',
  'real_estate_housing/1068.pdf',
  'real_estate_housing/1141.pdf',
  'real_estate_housing/1407.pdf',
  'real_estate_housing/1408.pdf',
  'real_estate_housing/1416.pdf',
  'real_estate_housing/1440.pdf',
  'real_estate_housing/1447.pdf',
  'real_estate_housing/1448.pdf',
  'real_estate_housing/1449.pdf',
  'real_estate_housing/1450.pdf',
  'real_estate_housing/1513.pdf',
  'real_estate_housing/1759.pdf',
  'real_estate_housing/1760.pdf',
  'real_estate_housing/2022.pdf',
  'real_estate_housing/2060.pdf',
  'real_estate_housing/2063.pdf',
  'real_estate_housing/2712.pdf',
  'real_estate_housing/2990.pdf',
  'real_estate_housing/4042.pdf',
  'real_estate_housing/4052.pdf',
  'real_estate_housing/6785.2.pdf',
  'real_estate_housing/6785.4.pdf',
  'real_estate_housing/9834.pdf',
  'real_estate_housing/9908.pdf',
  'real_estate_housing/25002.pdf',
  'real_estate_housing/25006-a.pdf',
  'real_estate_housing/25012.pdf',
  'real_estate_housing/25013.pdf',
  'real_estate_housing/25017.pdf',
  'real_estate_housing/25020.pdf',
  'real_estate_housing/25024.pdf',
  'real_estate_housing/25025.pdf',
  'real_estate_housing/25027.pdf',
  'real_estate_housing/25029.pdf',
  'real_estate_housing/25227.pdf',
  'real_estate_housing/27005.1.pdf',
  'real_estate_housing/27012.pdf',
  'real_estate_housing/27014.pdf',
  'real_estate_housing/27029.pdf',
  'real_estate_housing/27207.pdf',
  'real_estate_housing/27300.pdf',
  'real_estate_housing/30001.pdf',
  'real_estate_housing/30003.pdf',
  'real_estate_housing/30011.pdf',
  'real_estate_housing/30020.pdf',
  'real_estate_housing/40003.pdf',
  'real_estate_housing/40075.pdf',
  'real_estate_housing/40076c1.pdf',
  'real_estate_housing/40076c2.pdf',
  'real_estate_housing/40076hbc.pdf',
  'real_estate_housing/40084.pdf',
  'real_estate_housing/40094.pdf',
  'real_estate_housing/40096.pdf',
  'real_estate_housing/40096-m.pdf',
  'real_estate_housing/40097.pdf',
  'real_estate_housing/40122.pdf',
  'real_estate_housing/40123.pdf',
  'real_estate_housing/40932.pdf',
  'real_estate_housing/50001.pdf',
  'real_estate_housing/50078.pdf',
  'real_estate_housing/52735-as.pdf',
  'real_estate_housing/54110.pdf',
  'real_estate_housing/54115.pdf',
  'real_estate_housing/54118mcr.pdf',
  'real_estate_housing/54118und.pdf',
  'real_estate_housing/54118val.pdf',
  'real_estate_housing/55017.pdf',
  'real_estate_housing/55026.pdf',
  'real_estate_housing/55132.pdf',
  'real_estate_housing/55135.pdf',
  'real_estate_housing/55505.pdf',
  'real_estate_housing/55509.pdf',
  'real_estate_housing/56004.pdf',
  'real_estate_housing/56150.pdf',
  'real_estate_housing/60003.pdf',
]);

const THIRD_PASS_LOW_VALUE_FILE_KEYS = new Set([
  // 2026-04 third pass: prune additional HUD attachment/supplement/admin
  // variants that still leak through the hosted catalog. These are the lowest
  // signal forms left in the housing bucket after the earlier passes.
  'real_estate_housing/2576-ohf.pdf',
  'real_estate_housing/4128-ohf.pdf',
  'real_estate_housing/50059-a.pdf',
  'real_estate_housing/50080alc.pdf',
  'real_estate_housing/50080cah.pdf',
  'real_estate_housing/50080cia.pdf',
  'real_estate_housing/50080df2.pdf',
  'real_estate_housing/50080mtw.pdf',
  'real_estate_housing/52523-a.pdf',
  'real_estate_housing/52523-b.pdf',
  'real_estate_housing/52524-a.pdf',
  'real_estate_housing/52524-b.pdf',
  'real_estate_housing/52538-a.pdf',
  'real_estate_housing/52539-a.pdf',
  'real_estate_housing/52670a-2.pdf',
  'real_estate_housing/52670a-3.pdf',
  'real_estate_housing/52670a-6.pdf',
  'real_estate_housing/52671-a.pdf',
  'real_estate_housing/52671-b.pdf',
  'real_estate_housing/52671-c.pdf',
  'real_estate_housing/52785.pdf',
  'real_estate_housing/52787.pdf',
  'real_estate_housing/52790.pdf',
  'real_estate_housing/52797.pdf',
  'real_estate_housing/52800.pdf',
  'real_estate_housing/52840.pdf',
  'real_estate_housing/52844.pdf',
  'real_estate_housing/52910.pdf',
  'real_estate_housing/53012-a.pdf',
  'real_estate_housing/53242.pdf',
  'real_estate_housing/53243.pdf',
  'real_estate_housing/53244.pdf',
  'real_estate_housing/5369-b.pdf',
  'real_estate_housing/90011.pdf',
  'real_estate_housing/90012.pdf',
  'real_estate_housing/90103.pdf',
  'real_estate_housing/90106.pdf',
  'real_estate_housing/90173cca.pdf',
  'real_estate_housing/90175.1-ca.pdf',
  'real_estate_housing/92006.pdf',
  'real_estate_housing/92013.pdf',
  'real_estate_housing/92023.pdf',
  'real_estate_housing/92045.pdf',
  'real_estate_housing/92201-a.pdf',
  'real_estate_housing/92243.pdf',
  'real_estate_housing/92441m-supp.pdf',
  'real_estate_housing/92442-a.pdf',
  'real_estate_housing/94128-ohf.pdf',
  'real_estate_housing/94193.pdf',
  'real_estate_housing/94194.pdf',
]);

const FOURTH_PASS_LOW_VALUE_FILE_KEYS = new Set([
  // 2026-04 fourth pass: aggressively keep only the strongest remaining
  // public-facing workflows in the last low-signal HUD, CBP, and SBA tail.
  // This trims specialized project accounting, servicing, carrier, and niche
  // compliance paperwork while preserving the more obvious settlement,
  // borrower, importer, and claim forms.
  'customs_logistics/cbp_101__CBP_Form_101.pdf',
  'customs_logistics/cbp_214__CBP_Form_214.pdf',
  'customs_logistics/cbp_26__CBP_Form_26.pdf',
  'customs_logistics/cbp_3078__cbp_form_3078.pdf',
  'customs_logistics/cbp_3124__cbp_form_3124.pdf',
  'customs_logistics/cbp_3171__cbp_form_3171.pdf',
  'customs_logistics/cbp_3311__cbp_form_3311.pdf',
  'customs_logistics/cbp_3400__cbp_form_3400.pdf',
  'customs_logistics/cbp_3485__cbp_form_3485.pdf',
  'customs_logistics/cbp_4315__cbp_form_4315.pdf',
  'customs_logistics/cbp_4455__cbp_form_4455.pdf',
  'customs_logistics/cbp_4609__CBP_Form_4609.pdf',
  'customs_logistics/cbp_4630__cbp_form_4630.pdf',
  'customs_logistics/cbp_4632__CBP_Form_4632.pdf',
  'customs_logistics/cbp_4811__cbp_form_4811.pdf',
  'customs_logistics/cbp_5125__CBP_Form_5125.pdf',
  'customs_logistics/cbp_5129__cbp_form_5129.pdf',
  'customs_logistics/cbp_6043__CBP_Form_6043.pdf',
  'customs_logistics/cbp_6478__CBP_Form_6478.pdf',
  'customs_logistics/cbp_6480__CBP_Form_6480.pdf',
  'customs_logistics/cbp_7401__cbp_form_7401.pdf',
  'customs_logistics/cbp_7507__cbp_form_7507.pdf',
  'customs_logistics/cbp_7509__CBP_Form_7509.pdf',
  'customs_logistics/cbp_7512__cbp_form_7512.pdf',
  'customs_logistics/cbp_7512a__cbp_form_7512a.pdf',
  'customs_logistics/cbp_7523__cbp_form_7523.pdf',
  'customs_logistics/cbp_7533__CBP_Form_7533.pdf',
  'customs_logistics/cbp_7553__CBP_Form_7553.pdf',
  'customs_logistics/cbp_79__cbp_form_79.pdf',
  'customs_logistics/cbp_i-408__CBP_Form_I-408.pdf',
  'customs_logistics/cbp_i-418__cbp_form_i-418.pdf',
  'customs_logistics/cbp_i-510__cbp_form_i-510_0.pdf',
  'customs_logistics/cbp_i-760__CBP_Form_I-760.pdf',
  'customs_logistics/cbp_i-775__CBP_Form_I-775.pdf',
  'real_estate_housing/21004.pdf',
  'real_estate_housing/21006.pdf',
  'real_estate_housing/21008.pdf',
  'real_estate_housing/2283.pdf',
  'real_estate_housing/2409.pdf',
  'real_estate_housing/25015-a.pdf',
  'real_estate_housing/25015.pdf',
  'real_estate_housing/3111.pdf',
  'real_estate_housing/3259.pdf',
  'real_estate_housing/3416.pdf',
  'real_estate_housing/50059.pdf',
  'real_estate_housing/52483.pdf',
  'real_estate_housing/52540.pdf',
  'real_estate_housing/52664.pdf',
  'real_estate_housing/52670.pdf',
  'real_estate_housing/52682.pdf',
  'real_estate_housing/92210.pdf',
  'real_estate_housing/92266.pdf',
  'real_estate_housing/92403.pdf',
  'real_estate_housing/92456.pdf',
  'real_estate_housing/92700.pdf',
  'real_estate_housing/93104.pdf',
  'real_estate_housing/93232-a.pdf',
  'real_estate_housing/94195.pdf',
  'real_estate_housing/94196.pdf',
  'real_estate_housing/96012.pdf',
  'real_estate_housing/96014.pdf',
  'real_estate_housing/9839-a.pdf',
  'real_estate_housing/9839-b.pdf',
  'real_estate_housing/9839-c.pdf',
  'real_estate_housing/9911.pdf',
  'real_estate_housing/9912.pdf',
  'real_estate_housing/rd_1940-43__rd1940-0043.pdf',
  'real_estate_housing/rd_1944-61__rd1944-61.pdf',
  'real_estate_housing/rd_1944-62__rd1944-62.pdf',
  'real_estate_housing/rd_3550-4__rd3550-0004.pdf',
  'small_business/sba_form_1081-statement__SBA_Form_1081_-_Statement_of_Personal_History_02.2023_1_.pdf',
  'small_business/sba_form_1150-offer__sba_elending_clc_forms1150_4.pdf',
  'small_business/sba_form_1244-application__Form_1244_-_ALP_Express_extension_11.29.2022_508_1_.pdf',
  'small_business/sba_form_1366-sba__tools_sbf_form1366_6.pdf',
  'small_business/sba_form_1450-8a__SBA_FORM_1450_Revised1_7.pdf',
  'small_business/sba_form_148-l__sba_elending_clc_forms148l.pdf',
  'small_business/sba_form_148-unconditional__sba_elending_clc_forms148-508.pdf',
  'small_business/sba_form_159-fee__SBA_Form_159_2.10.22-508_0.pdf',
  'small_business/sba_form_159d-fee__Form_159D_-_Compensation_Agreement_FINAL_.pdf',
  'small_business/sba_form_1941a-financing__SBA_FORM_1941A_04-30-201_review_4_1_.pdf',
  'small_business/sba_form_1941b-financing__SBA_FORM_1941B_04-30-2017_review_4_1_.pdf',
  'small_business/sba_form_1941c-financing__SBA_FORM_1941C_04-30-2017_4.pdf',
  'small_business/sba_form_1993-federal__Form_1993_1.pdf',
  'small_business/sba_form_2289-borrower__SBA_Form_2289_3.pdf',
  'small_business/sba_form_2481-certification__SBA_Form_2481_Historic_Property_Review_for_SBA_Loan.pdf',
  'small_business/sba_form_3508d-paycheck__SBA_Form_3508D_7-30-21_-508.pdf',
  'small_business/sba_form_3513-declaration__SBA_Form_3513_11-24_Declaration_of_Identity_Theft.pdf',
  'small_business/sba_form_3520-builders__Builder_Certification_-_SBA_Form_3520_-_Final_0.pdf',
  'small_business/sba_form_3521-disaster__Disaster_Loan_Modification_-_SBA_Form_3521_-_Final.pdf',
  'small_business/sba_form_355-information__SBA_Form_355_fillable_Expires_8-31-2028.pdf',
  'small_business/sba_form_4506-c__Form_4506-C_2024_Tax_Yr_508.pdf',
  'small_business/sba_form_601-agreement__SBA_601_3-508.pdf',
  'small_business/sba_form_770-financial__FORM_770_3245-0012_10-23-2024_2_.pdf',
  'small_business/sba_form_991-surety__SBAForm991_1_.pdf',
  'small_business/sba_form_994-application__SBA_Form_994_V.2_Final_.pdf',
  'small_business/sba_form_994b-surety__SBAForm994B-R-1_508.pdf',
  'small_business/sba_form_borrowers-consent__BDLSC_Borrower_Authorization_-_5-23.pdf',
  'small_business/sba_form_sba-form__Form_148L_-_Unconditional_Limited_Guarantee_FINAL_5-30-25_-_06-17-2025.pdf',
  'small_business/sba_form_sba-standard__040720note-508.pdf',
  'small_business/sba_form_shuttered-venue__SBA_Form_4506T_-_March_2019_Version-SVOG-fillable-v2_instruct-508.pdf',
]);

const FIFTH_PASS_LOW_VALUE_FILE_KEYS = new Set([
  // 2026-04 fifth pass: prune the remaining long-tail institutional categories
  // that add little general catalog value compared with public filer, intake,
  // and consumer workflows. This intentionally removes the last federal
  // criminal and procurement slices plus narrower provider/passport/SSA/VA
  // specialist forms.
  'contracts_procurement/sf-1199a__sf1199a-20.pdf',
  'contracts_procurement/sf-1413__sf1413-23a.pdf',
  'contracts_procurement/sf-1414__sf1414-23a.pdf',
  'contracts_procurement/sf-1415__sf1415-23a.pdf',
  'contracts_procurement/sf-1416__sf1416-23a.pdf',
  'contracts_procurement/sf-1418__sf1418-23a.pdf',
  'contracts_procurement/sf-1449__sf1449-21.pdf',
  'contracts_procurement/sf-18__sf18-95a.pdf',
  'contracts_procurement/sf-24__sf24-23a.pdf',
  'contracts_procurement/sf-25__sf25-23a.pdf',
  'contracts_procurement/sf-25a__sf25a-23a.pdf',
  'contracts_procurement/sf-25b__sf25b-23a.pdf',
  'contracts_procurement/sf-30__sf30-16c.pdf',
  'contracts_procurement/sf-3881__sf3881-03b.pdf',
  'criminal_justice/ao_100a__ao100a_0.pdf',
  'criminal_justice/ao_100b__ao100b.pdf',
  'criminal_justice/ao_102__ao102.pdf',
  'criminal_justice/ao_103__ao103.pdf',
  'criminal_justice/ao_104__ao104.pdf',
  'criminal_justice/ao_106__ao106.pdf',
  'criminal_justice/ao_106a__ao_106a_0818_0.pdf',
  'criminal_justice/ao_108__ao108.pdf',
  'criminal_justice/ao_109__ao109.pdf',
  'criminal_justice/ao_110__ao110.pdf',
  'criminal_justice/ao_190__ao190.pdf',
  'criminal_justice/ao_191__ao191.pdf',
  'criminal_justice/ao_199a__ao199a.pdf',
  'criminal_justice/ao_199b__ao199b.pdf',
  'criminal_justice/ao_199c__ao199c.pdf',
  'criminal_justice/ao_245b__ao245b.pdf',
  'criminal_justice/ao_245c__ao245c.pdf',
  'criminal_justice/ao_245d__ao245d.pdf',
  'criminal_justice/ao_245e__ao245e.pdf',
  'criminal_justice/ao_245sor__ao245sor.pdf',
  'criminal_justice/ao_246__ao246.pdf',
  'criminal_justice/ao_246a__ao246a.pdf',
  'criminal_justice/ao_246b__ao246b.pdf',
  'criminal_justice/ao_247__ao_247_0.pdf',
  'criminal_justice/ao_248__ao_248.pdf',
  'criminal_justice/ao_249__ao249.pdf',
  'criminal_justice/ao_250__ao-250.pdf',
  'criminal_justice/ao_442__ao442.pdf',
  'criminal_justice/ao_443__ao443.pdf',
  'criminal_justice/ao_444__ao444.pdf',
  'criminal_justice/ao_455__ao455.pdf',
  'criminal_justice/ao_466__ao466.pdf',
  'criminal_justice/ao_466a__ao466a.pdf',
  'criminal_justice/ao_467__ao467.pdf',
  'criminal_justice/ao_468__ao468.pdf',
  'criminal_justice/ao_470__ao470.pdf',
  'criminal_justice/ao_471__ao471.pdf',
  'criminal_justice/ao_472__ao-472.pdf',
  'criminal_justice/ao_83__ao083.pdf',
  'criminal_justice/ao_86a__ao086a.pdf',
  'criminal_justice/ao_89__ao089.pdf',
  'criminal_justice/ao_89b__ao_089b_0.pdf',
  'criminal_justice/ao_90__ao090.pdf',
  'criminal_justice/ao_91__ao091.pdf',
  'criminal_justice/ao_93__ao093.pdf',
  'criminal_justice/ao_93a__ao093a.pdf',
  'criminal_justice/ao_93b__ao093b.pdf',
  'criminal_justice/ao_93c__ao_093c_0818_0.pdf',
  'criminal_justice/ao_94__ao094.pdf',
  'criminal_justice/ao_98__ao098.pdf',
  'criminal_justice/ao_99__ao099.pdf',
  'criminal_justice/ao-0245sor_org__ao245sor-org-updatedsept15-finalversion.pdf',
  'veterans/va_21-4170__vba-21-4170-are.pdf',
  'veterans/va_21p-4706b__vba-21p-4706b-are.pdf',
  'veterans/va_22-1999b__vba-22-1999b-are.pdf',
  'veterans/va_22-8691__vba-22-8691-are.pdf',
  'veterans/va_26-6705__vba-26-6705-are.pdf',
  'veterans/va_28-8832__vba-28-8832-are.pdf',
  'veterans/va_29-336__vba-29-336-are.pdf',
  'veterans/va_29-8636__vba-29-8636-are.pdf',
]);

const SIXTH_PASS_LOW_VALUE_FILE_KEYS = new Set([
  // 2026-04 sixth pass: trim the remaining long-tail pension-verification,
  // outdated PPP, and secondary housing workflows. Restored healthcare /
  // provider forms now stay in the catalog. This keeps the stronger consumer,
  // filer, borrower, and enrollment forms in each remaining category.
  'patient_intake/mkt-appeal-a__marketplace-appeal-request-form-a.pdf',
  'patient_intake/mkt-appeal-d__marketplace-appeal-request-form-d.pdf',
  'patient_intake/mkt-appeal-s__marketplace-appeal-request-form-s.pdf',
  'patient_intake/va_10-0137a__10-0137A.pdf',
  'patient_intake/va_10-10163__10-10163-fill.pdf',
  'patient_intake/va_10-10164__10-10164-fill.pdf',
  'patient_intake/va_10-2410__vha-10-2410-fill.pdf',
  'patient_intake/va_10-2553__Cert_10-2553_Certificate_of_Residency_Blank_Template.pdf',
  'patient_intake/va_10-259__10-259_Revocation_of_Authorization_for_Release_of_Release_of_Individually-Idenrifiable_Health_Information.pdf',
  'patient_intake/va_10-493__10-493.pdf',
  'real_estate_housing/1459.pdf',
  'real_estate_housing/2456.pdf',
  'real_estate_housing/92556.pdf',
  'real_estate_housing/9887.pdf',
  'small_business/sba_form_3508-ppp__PPP_--_Forgiveness_Application_and_Instructions_--_3508_7.30.2021_-508.pdf',
  'small_business/sba_form_3508ez-ppp__PPP_--_Forgiveness_Applications_and_Instructions_--_3508EZ_7.30.2021_-508.pdf',
  'small_business/sba_form_3508s-ppp__PPP_--_Forgiveness_Application_and_Instructions_--_3508S_7.30.2021_-508.pdf',
  'veterans/va_21-0779__vba-21-0779-are.pdf',
  'veterans/va_21-0845__vba-21-0845-are.pdf',
  'veterans/va_21p-0516-1__vba-21p-0516-1-are.pdf',
  'veterans/va_21p-0517-1__vba-21p-0517-1-are.pdf',
  'veterans/va_21p-0518-1__vba-21p-0518-1-are.pdf',
  'veterans/va_21p-8049__vba-21p-8049-are.pdf',
  'veterans/va_21p-8416__vba-21p-8416-are.pdf',
  'veterans/va_22-1990e__vba-22-1990e-are.pdf',
  'veterans/va_22-1990n__vba-22-1990n-are.pdf',
  'veterans/va_22-1995__vba-22-1995-are.pdf',
  'veterans/va_22-5490__vba-22-5490-are.pdf',
  'veterans/va_22-8864__vba-22-8864-are.pdf',
  'veterans/va_26-1817__vba-26-1817-are.pdf',
  'veterans/va_26-1820__vba-26-1820-are.pdf',
  'veterans/va_26-8497a__vba-26-8497a-are.pdf',
]);

const HIGH_VALUE_RESTORE_KEYS = new Set([
  // 2026-04 customs/logistics restoration: preserve the stronger CBP trade,
  // broker, FTZ, bonded-warehouse, drawback, payment, and manifest workflows
  // even though some were swept up by earlier broad low-value passes.
  'customs_logistics/cbp_26__CBP_Form_26.pdf',
  'customs_logistics/cbp_214__CBP_Form_214.pdf',
  'customs_logistics/cbp_214a__cbp_form_214a.pdf',
  'customs_logistics/cbp_214b__CBP_Form_214B.pdf',
  'customs_logistics/cbp_214c__CBP_Form_214C.pdf',
  'customs_logistics/cbp_216__cbp_form_216.pdf',
  'customs_logistics/cbp_226__cbp_form_226.pdf',
  'customs_logistics/cbp_300__cbp_form_300.pdf',
  'customs_logistics/cbp_301a__CBP_Form_301A.pdf',
  'customs_logistics/cbp_1300__cbp_form_1300.pdf',
  'customs_logistics/cbp_1302__CBP%20Form%201302.pdf',
  'customs_logistics/cbp_1304__CBP_Form_1304.pdf',
  'customs_logistics/cbp_3124__cbp_form_3124.pdf',
  'customs_logistics/cbp_3171__cbp_form_3171.pdf',
  'customs_logistics/cbp_3173__cbp_form_3173.pdf',
  'customs_logistics/cbp_3229__cbp_form_3229.pdf',
  'customs_logistics/cbp_3311__cbp_form_3311.pdf',
  'customs_logistics/cbp_3347__CBP_Form_3347.pdf',
  'customs_logistics/cbp_3347a__CBP_Form_3347A.pdf',
  'customs_logistics/cbp_3348__cbp_form_3348.pdf',
  'customs_logistics/cbp_339a__cbp_form_339a.pdf',
  'customs_logistics/cbp_339c__cbp_form_339c.pdf',
  'customs_logistics/cbp_339v__cbp_form_339v.pdf',
  'customs_logistics/cbp_349__cbp_form_349.pdf',
  'customs_logistics/cbp_350__cbp_form_350.pdf',
  'customs_logistics/cbp_400__cbp_form_400.pdf',
  'customs_logistics/cbp_401__cbp_form_401.pdf',
  'customs_logistics/cbp_3495__cbp_form_3495.pdf',
  'customs_logistics/cbp_3499__CBP_Form_3499.pdf',
  'customs_logistics/cbp_4315__cbp_form_4315.pdf',
  'customs_logistics/cbp_4455__cbp_form_4455.pdf',
  'customs_logistics/cbp_4609__CBP_Form_4609.pdf',
  'customs_logistics/cbp_4630__cbp_form_4630.pdf',
  'customs_logistics/cbp_4632__CBP_Form_4632.pdf',
  'customs_logistics/cbp_5297__CBP_Form_5297.pdf',
  'customs_logistics/cbp_7507__cbp_form_7507.pdf',
  'customs_logistics/cbp_7509__CBP_Form_7509.pdf',
  'customs_logistics/cbp_7512__cbp_form_7512.pdf',
  'customs_logistics/cbp_7512a__cbp_form_7512a.pdf',
  'customs_logistics/cbp_7523__cbp_form_7523.pdf',
  'customs_logistics/cbp_7533__CBP_Form_7533.pdf',
  'customs_logistics/cbp_7553__CBP_Form_7553.pdf',
]);

const SEVENTH_PASS_LOW_VALUE_FILE_KEYS = new Set([
  // 2026-04 seventh pass: prune the remaining VA support/admin forms while
  // keeping the strongest veteran-facing public workflows. Federal civil
  // litigation now keeps the full current national U.S. Courts civil catalog
  // rather than a hand-pruned subset so the hosted section stays aligned with
  // the official source page.
  'veterans/va_21-0781__vba-21-0781-are.pdf',
  'veterans/va_21-10210__vba-21-10210-are.pdf',
  'veterans/va_21-2680__vba-21-2680-are.pdf',
  'veterans/va_21-4138__vba-21-4138-are.pdf',
  'veterans/va_21-4142__vba-21-4142-are.pdf',
  'veterans/va_21-4142a__vba-21-4142a-are.pdf',
  'veterans/va_21-4502__vba-21-4502-are.pdf',
  'veterans/va_21-686c__vba-21-686c-are.pdf',
  'veterans/va_26-4555__vba-26-4555-are.pdf',
  'veterans/va_26-8497__vba-26-8497-are.pdf',
  'veterans/va_28-1900__vba-28-1900-are.pdf',
]);

const EIGHTH_PASS_LOW_VALUE_FILE_KEYS = new Set([
  // 2026-04 eighth pass: cap the individual tax shelf at 300 by dropping the
  // oldest archived year plus a few narrow 2023 employer, corporate, and
  // partnership carryover forms. This preserves every current-year
  // tax_individual form and keeps the stronger 2023 amendment/backfill set.
  'tax_individual/2678__2023_2678.pdf',
  'tax_individual/4255__2023_4255.pdf',
  'tax_individual/4626__2023_4626.pdf',
  'tax_individual/8082__2023_8082.pdf',
  'tax_individual/8308__2023_8308.pdf',
  'tax_individual/8952__2023_8952.pdf',
]);

const NINTH_PASS_LOW_VALUE_FILE_KEYS = new Set([
  // 2026-04 ninth pass: trim the payroll category's weakest admin/support
  // tail so the hosted shelf stays centered on payroll returns, amendments,
  // wage statements, and benefit-plan filings instead of niche e-file
  // exceptions, foreign-preparer paperwork, and user-fee forms.
  'tax_payroll/8453-x__f8453x.pdf',
  'tax_payroll/8508__f8508.pdf',
  'tax_payroll/8508-i__f8508i.pdf',
  'tax_payroll/8717__f8717.pdf',
  'tax_payroll/8944__f8944.pdf',
  'tax_payroll/8945__f8945.pdf',
  'tax_payroll/8948__f8948.pdf',
]);

const SMALL_BUSINESS_KEEP_KEYS = new Set([
  // 2026-04 SBA curation pass: keep a 50-form shelf built around the
  // strongest borrower, disaster-loan, 7(a)/504 lending, surety, PPP, 8(a),
  // HUBZone, and size/certification workflows. Everything else in
  // `small_business` is intentionally pruned so the hosted catalog stays
  // focused on operator-facing forms instead of the long-tail internal
  // reports, lender checklists, debenture opinions, and grant/admin
  // paperwork that also appears in SBA's documents index.
  'small_business/sba_form_5-disaster__SBA-Disaster-Form-5.pdf',
  'small_business/sba_form_5c-disaster__SBA-Disaster-Form-5c.pdf',
  'small_business/sba_form_2202-schedule__2202_Schedule_of_Liabilities-508.pdf',
  'small_business/sba_form_413-personal__SBAForm413.pdf',
  'small_business/sba_form_912-statement__Form_912_expires_1.31.2029.pdf',
  'small_business/sba_form_4506-c__Form_4506-C_2024_Tax_Yr_508.pdf',
  'small_business/sba_form_1366-sba__tools_sbf_form1366_6.pdf',
  'small_business/sba_form_3513-declaration__SBA_Form_3513_11-24_Declaration_of_Identity_Theft.pdf',
  'small_business/sba_form_3521-disaster__Disaster_Loan_Modification_-_SBA_Form_3521_-_Final.pdf',
  'small_business/sba_form_770-financial__FORM_770_3245-0012_10-23-2024_2_.pdf',
  'small_business/sba_form_borrowers-consent__BDLSC_Borrower_Authorization_-_5-23.pdf',
  'small_business/sba_form_3520-builders__Builder_Certification_-_SBA_Form_3520_-_Final_0.pdf',
  'small_business/sba_form_1919-borrower__2025.02.27_Form_1919_-_Updates_FINAL__03-12-2025_1_.pdf',
  'small_business/sba_form_1920-lenders__sba-form-1920.pdf',
  'small_business/sba_form_1244-sba__SBA_Form_1244_-_SBA_504_Borrower_Information_Form_effective_02.2025.pdf',
  'small_business/sba_form_1244-application__Form_1244_-_ALP_Express_extension_11.29.2022_508_1_.pdf',
  'small_business/sba_form_159-fee__SBA_Form_159_2.10.22-508_0.pdf',
  'small_business/sba_form_159d-fee__Form_159D_-_Compensation_Agreement_FINAL_.pdf',
  'small_business/sba_form_160-resolution__SBA_Form_160-508.pdf',
  'small_business/sba_form_33-authorization__SBA_Form_33_OMB_Ext_07-31-2027_.pdf',
  'small_business/sba_form_34-bank__SBA_Form_34_Bank_ID_OMB_Ext_07-31-2027_.pdf',
  'small_business/sba_form_1050-settlement__3245-0200SBAForm1050-R.pdf',
  'small_business/sba_form_148-l__sba_elending_clc_forms148l.pdf',
  'small_business/sba_form_148-unconditional__sba_elending_clc_forms148-508.pdf',
  'small_business/sba_form_1505-note__SBA_1505.pdf',
  'small_business/sba_form_2289-borrower__SBA_Form_2289_3.pdf',
  'small_business/sba_form_sba-standard__040720note-508.pdf',
  'small_business/sba_form_355-information__SBA_Form_355_fillable_Expires_8-31-2028.pdf',
  'small_business/sba_form_480-size__SBA_Form_480_exp_8-31-2026_.pdf',
  'small_business/sba_form_3881-ach__SF_3881_4.pdf',
  'small_business/sba_form_1010-nho__SBA_Form_1010_NHO_new_-_SBA_Updated_Expiration_Date.pdf',
  'small_business/sba_form_1010b-ait__SBA_Form_1010_AIT_new_-_SBA_Updated_Expiration_Date.pdf',
  'small_business/sba_form_1010b-anc__SBA_Form_1010_ANC_new_-_SBA_Updated_Expiration_Date.pdf',
  'small_business/sba_form_1010b-cdc__SBA_1010_CDC_new_-_SBA_Updated_Expiration_Date.pdf',
  'small_business/sba_form_1010b-ind__SBA_Form_1010_IND_2017_New_3.pdf',
  'small_business/sba_form_1450-8a__SBA_FORM_1450_Revised1_7.pdf',
  'small_business/sba_form_2408-hubzone__SBA_Form_2408_3.pdf',
  'small_business/sba_form_2301-community__SBA_Form_2301_FINAL_with_links-508.pdf',
  'small_business/sba_form_2449-community__SBAForm3518.pdf',
  'small_business/sba_form_2534-7a__SBAForm2534_3__0.pdf',
  'small_business/sba_form_2450-504__SBA_Form_2450__04-18_2_.pdf',
  'small_business/sba_form_990-surety__SBAForm990.pdf',
  'small_business/sba_form_994-application__SBA_Form_994_V.2_Final_.pdf',
  'small_business/sba_form_994b-surety__SBAForm994B-R-1_508.pdf',
  'small_business/sba_form_994h-surety__SBAForm994H-R_1_.pdf',
  'small_business/sba_form_3506-ppp__SBA-Form-3506-PPP--Agreement-for-New-Lenders-Banks-Credit-Unions-FCS_revised_4-9-21_-508.pdf',
  'small_business/sba_form_3507-ppp__SBA-Form-3507-PPP--Agreement-for-New-Lenders-Non-Bank-Non-Insured-Depository-Institution-Lenders_revised_4-9-21_-508.pdf',
  'small_business/sba_form_3508-ppp__PPP_--_Forgiveness_Application_and_Instructions_--_3508_7.30.2021_-508.pdf',
  'small_business/sba_form_3508ez-ppp__PPP_--_Forgiveness_Applications_and_Instructions_--_3508EZ_7.30.2021_-508.pdf',
  'small_business/sba_form_3508s-ppp__PPP_--_Forgiveness_Application_and_Instructions_--_3508S_7.30.2021_-508.pdf',
]);

const SOCIAL_SECURITY_KEEP_KEYS = new Set([
  // 2026-04 SSA curation pass: keep a 50-form shelf centered on the
  // strongest public claimant, hearing, appeal, disability-evidence,
  // Medicare, identity, survivor, and SSI workflows. The social security
  // section is now managed as one explicit keep-list instead of a stack of
  // subtractive passes so future prune runs stay predictable.
  'social_security/ss-5__ss-5.pdf',
  'social_security/ss-5-fs__ss-5fs.pdf',
  'social_security/ssa-1-bk__ssa-1-bk.pdf',
  'social_security/ssa-2-bk__ssa-2-bk.pdf',
  'social_security/ssa-4-bk__ssa-4-bk.pdf',
  'social_security/ssa-5-bk__ssa-5-bk.pdf',
  'social_security/ssa-7-f6__ssa-7.pdf',
  'social_security/ssa-8__ssa-8.pdf',
  'social_security/ssa-10__ssa-10.pdf',
  'social_security/ssa-16__ssa-16-bk.pdf',
  'social_security/ssa-21__ssa-21.pdf',
  'social_security/ssa-24__ssa-24.pdf',
  'social_security/ssa-25__ssa-25.pdf',
  'social_security/ssa-44__ssa-44.pdf',
  'social_security/ssa-89__ssa-89.pdf',
  'social_security/ssa-1372-bk__ssa-1372.pdf',
  'social_security/ssa-1724-f4__ssa-1724.pdf',
  'social_security/ssa-371__ssa-371.pdf',
  'social_security/ssa-372__ssa-372.pdf',
  'social_security/ssa-521__ssa-521.pdf',
  'social_security/ssa-561__ssa-561-u2.pdf',
  'social_security/ssa-632-bk__ssa-632-bk.pdf',
  'social_security/ssa-789__ssa-789.pdf',
  'social_security/ssa-1696__ssa-1696.pdf',
  'social_security/ssa-3288__ssa-3288.pdf',
  'social_security/ssa-3441-bk__ssa-3441.pdf',
  'social_security/ha-85__ha-85.pdf',
  'social_security/ha-86__ha-86.pdf',
  'social_security/ha-501-u5__ha-501.pdf',
  'social_security/ha-510__ha-510.pdf',
  'social_security/ha-520__ha-520.pdf',
  'social_security/ha-539__ha-539.pdf',
  'social_security/ha-4608__ha-4608.pdf',
  'social_security/ha-4631__ha-4631.pdf',
  'social_security/ha-4632__ha-4632.pdf',
  'social_security/ha-4633__ha-4633.pdf',
  'social_security/ssa-3368-bk__ssa-3368-bk.pdf',
  'social_security/ssa-3369-bk__ssa-3369.pdf',
  'social_security/ssa-3373-bk__ssa-3373-bk.pdf',
  'social_security/ssa-3380-bk__ssa-3380.pdf',
  'social_security/ssa-3820-bk__ssa-3820.pdf',
  'social_security/ssa-454-bk__ssa-454-bk.pdf',
  'social_security/ssa-455__ssa-455.pdf',
  'social_security/ssa-545-bk__ssa-545.pdf',
  'social_security/ssa-7004__ssa-7004.pdf',
  'social_security/ssa-7050-f4__ssa-7050.pdf',
  'social_security/ssa-820-bk__ssa-820.pdf',
  'social_security/ssa-821-bk__ssa-821.pdf',
  'social_security/ssa-827__ssa-827.pdf',
  'social_security/ssa-8000-bk__ssa-8000-bk.pdf',
]);

const TAX_INDIVIDUAL_ARCHIVE_YEAR_TO_PRUNE = '__2022_';

const TAX_BUSINESS_ARCHIVE_KEEP_KEYS = new Set([
  // 2026-04 ninth pass: keep the active business shelf intact, then preserve
  // only a hand-curated archive subset that covers the strongest 2023
  // amendment/backfill workflows. The current tax_business shelf has 168
  // current/undated forms, so keeping these 32 archived variants lands the
  // section at 200 without dropping present-year coverage.
  'tax_business/1041__2023_1041.pdf',
  'tax_business/1041-es__2023_1041es.pdf',
  'tax_business/1041_schedule_d__2023_1041sd.pdf',
  'tax_business/1041_schedule_k-1__2023_1041sk1.pdf',
  'tax_business/1042__2023_1042.pdf',
  'tax_business/1042-s__2023_1042s.pdf',
  'tax_business/1042-t__2023_1042t.pdf',
  'tax_business/1065__2023_1065.pdf',
  'tax_business/1065-x__2023_1065x.pdf',
  'tax_business/1065_schedule_d__2023_1065sd.pdf',
  'tax_business/1065_schedule_k-1__2023_1065sk1.pdf',
  'tax_business/1120__2023_1120.pdf',
  'tax_business/1120-c__2023_1120c.pdf',
  'tax_business/1120-f__2023_1120f.pdf',
  'tax_business/1120-h__2023_1120h.pdf',
  'tax_business/1120-s__2023_1120s.pdf',
  'tax_business/1120-w__2022_1120w.pdf',
  'tax_business/1120_schedule_d__2023_1120sd.pdf',
  'tax_business/2290__2023_2290.pdf',
  'tax_business/5471__2023_5471.pdf',
  'tax_business/6765__2023_6765.pdf',
  'tax_business/709__2023_709.pdf',
  'tax_business/720__2023_720.pdf',
  'tax_business/8288__2023_8288.pdf',
  'tax_business/8846__2023_8846.pdf',
  'tax_business/8865__2023_8865.pdf',
  'tax_business/8881__2023_8881.pdf',
  'tax_business/8974__2023_8974.pdf',
  'tax_business/8990__2022_8990.pdf',
  'tax_business/8995__2023_8995.pdf',
  'tax_business/8995-a__2023_8995a.pdf',
  'tax_business/8997__2023_8997.pdf',
]);

const LOW_VALUE_TITLE_PATTERNS_BY_SECTION = new Map([
  ['customs_logistics', [
    /\bHarbor Maintenance Fee Quarterly Summary Report\b/i,
    /\bHarbor Maintenance Fee Amended Quarterly Summary Report\b/i,
    /\bDocument\/Payment Transmittal\b/i,
  ]],
  ['real_estate_housing', [
    /\bDoc \d+\b/i,
  ]],
  ['small_business', [
    /\bLender'?s Transcript of Account\b/i,
    /\bRisk Management Data Base Form\b/i,
    /\bSBA Wire Transfer Form\b/i,
    /\bSmall Business Development Center Counseling Record\b/i,
    /\bApplication for Certification as a Certified Development Company\b/i,
    /\bLender'?s Application for (?:Loan )?Guaranty\b/i,
    /\bGuaranty Loan Purchased\b/i,
    /\bSmall Business Tax Product Order Blank\b/i,
    /\bCDC Certification\b/i,
    /\bInterim Lender Certification\b/i,
    /\bCertification Regarding Debarment\b/i,
    /\bCertification Regarding Lobbying\b/i,
    /\bStatement Regarding Lobbying\b/i,
    /\bLiquidation Plan Format\b/i,
    /\bInstrument of Admission or Increase in Commitment for a Preferred Limited Partner\b/i,
    /\bNMVC Debenture\b/i,
    /\bAmendment to NMVCC Application\b/i,
    /\bRequest for SBA Approval of Management Services Fees\b/i,
    /\bApplication to Become a Loan Pool Originator\b/i,
    /\bReinsurance Agreement In Favor of the United States\b/i,
    /\bDebenture Opinion of Counsel\b/i,
    /\bLMI Debenture Opinion of Counsel\b/i,
    /\bListing Collateral Documents\b/i,
    /\bSupplemental Questionnaire for Selected Positions\b/i,
    /\bContinuation Sheet for Questionnaires SF 86, SF 85 P, and SF 85\b/i,
    /\bCommunity Advantage Addendum\b.*\bSBLC\b/i,
    /\bCost Sharing Proposal\b/i,
    /\bAgreement for New Lenders\b/i,
    /\bPPP Loan Necessity Questionnaire\b/i,
    /\bSecondary Participation Guarant(?:y|ee) Agreement\b/i,
    /\bSchedule of Work in Process\b/i,
    /\bDebenture\b/i,
    /\bRequest to Honor SBA 7a Loan Guaranty\b/i,
    /\bRequest for Approval of Transfer Certificate\b/i,
    /\bLenderCertification\b/i,
    /\bLenderApplication2484\b/i,
    /\b750CA\b/i,
    /\bAddendum to Franchise Agreement\b/i,
    /\bSecurity Agreement\b/i,
  ]],
]);

const PREFERRED_SECTION_BY_FORM_KEY = new Map([
  ['4720', 'nonprofit'],
  ['5578', 'nonprofit'],
  ['7004', 'tax_business'],
  ['8038TC', 'tax_business'],
  ['8282', 'nonprofit'],
  ['8832', 'tax_business'],
  ['8849', 'tax_business'],
  ['8911', 'tax_individual'],
  ['8936', 'tax_individual'],
  ['8938', 'tax_individual'],
  ['CMS10106', 'patient_intake'],
  ['CMS10797', 'patient_intake'],
  ['CMS1490S', 'patient_intake'],
  ['CMS1696', 'patient_intake'],
  ['CMS1763', 'patient_intake'],
  ['CMS20027', 'patient_intake'],
  ['CMS20033', 'patient_intake'],
  ['CMS40B', 'patient_intake'],
  ['CMSL564', 'patient_intake'],
]);

const CURATED_REAL_ESTATE_HOUSING_KEEP_KEYS = new Set([
  // 2026-04 curated real-estate/housing shelf: keep a broader, intentionally
  // selected mix of settlement, borrower, tenant-assistance, rental-housing,
  // project-finance, construction, and housing-agreement workflows. This is a
  // keep-list rather than a blanket rollback of every HUD document because the
  // HUD index also carries a large tail of internal admin, reporting, and
  // attachment forms that add little catalog value.
  'real_estate_housing/1.pdf',
  'real_estate_housing/1a.pdf',
  'real_estate_housing/2283.pdf',
  'real_estate_housing/2453.1-ca.pdf',
  'real_estate_housing/2409.pdf',
  'real_estate_housing/2995.pdf',
  'real_estate_housing/3111.pdf',
  'real_estate_housing/40094.pdf',
  'real_estate_housing/40096.pdf',
  'real_estate_housing/40097.pdf',
  'real_estate_housing/40122.pdf',
  'real_estate_housing/40151.pdf',
  'real_estate_housing/40152.pdf',
  'real_estate_housing/40164.pdf',
  'real_estate_housing/50059.pdf',
  'real_estate_housing/50059-a.pdf',
  'real_estate_housing/52483.pdf',
  'real_estate_housing/52523-a.pdf',
  'real_estate_housing/52523-b.pdf',
  'real_estate_housing/52524-a.pdf',
  'real_estate_housing/52524-b.pdf',
  'real_estate_housing/52570.pdf',
  'real_estate_housing/52570-a.pdf',
  'real_estate_housing/52671-a.pdf',
  'real_estate_housing/52671-b.pdf',
  'real_estate_housing/52671-c.pdf',
  'real_estate_housing/52682.pdf',
  'real_estate_housing/52734-a.pdf',
  'real_estate_housing/52734-b.pdf',
  'real_estate_housing/52734-c.pdf',
  'real_estate_housing/52832.pdf',
  'real_estate_housing/90106.pdf',
  'real_estate_housing/92006.pdf',
  'real_estate_housing/92013.pdf',
  'real_estate_housing/92243.pdf',
  'real_estate_housing/92266.pdf',
  'real_estate_housing/92403.pdf',
  'real_estate_housing/92442-ca.pdf',
  'real_estate_housing/92450-ca.pdf',
  'real_estate_housing/92556.pdf',
  'real_estate_housing/9832.pdf',
  'real_estate_housing/9887.pdf',
  'real_estate_housing/9911.pdf',
  'real_estate_housing/9912.pdf',
  'real_estate_housing/rd_1940-43__rd1940-0043.pdf',
  'real_estate_housing/rd_1944-61__rd1944-61.pdf',
  'real_estate_housing/rd_1944-62__rd1944-62.pdf',
  'real_estate_housing/rd_3550-1__rd3550-0001.pdf',
  'real_estate_housing/rd_3550-4__rd3550-0004.pdf',
  'real_estate_housing/rd_410-4__rd410-4.pdf',
]);

const SECTION_PRIORITY = new Map([
  ['patient_intake', 0],
  ['healthcare', 1],
  ['nonprofit', 2],
  ['tax_business', 3],
  ['tax_individual', 4],
  ['tax_payroll', 5],
  ['labor_employment', 6],
  ['hr_onboarding', 7],
]);

function parseArgs(argv) {
  const args = argv.slice(2);
  const argSet = new Set(args);
  const sections = new Set();

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--section' && args[index + 1]) {
      sections.add(args[index + 1]);
      index += 1;
      continue;
    }
    if (value.startsWith('--section=')) {
      const section = value.slice('--section='.length).trim();
      if (section) {
        sections.add(section);
      }
    }
  }

  return {
    write: argSet.has('--write'),
    sections,
  };
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function manifestKey(entry) {
  return `${entry.section}/${entry.filename}`;
}

function normalizeFormKey(entry) {
  const candidates = [entry.form_number || ''];
  if (typeof entry.filename === 'string' && entry.filename.includes('__')) {
    candidates.push(entry.filename.split('__', 1)[0]);
  }

  for (const candidate of candidates) {
    const cleaned = String(candidate)
      .replace(/__20\d{2}_.+$/i, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '');
    if (cleaned) {
      return cleaned;
    }
  }

  return '';
}

function isForeignLanguageVariant(entry) {
  const haystack = `${entry.title || ''} ${entry.form_number || ''} ${entry.filename || ''}`;
  return LANGUAGE_PATTERNS.some((pattern) => pattern.test(haystack));
}

function isExplicitLowValueArtifact(entry) {
  const key = manifestKey(entry);
  if (entry.section === 'real_estate_housing') {
    return !CURATED_REAL_ESTATE_HOUSING_KEEP_KEYS.has(key);
  }
  if (entry.section === 'small_business') {
    return !SMALL_BUSINESS_KEEP_KEYS.has(key);
  }
  if (entry.section === 'social_security') {
    return !SOCIAL_SECURITY_KEEP_KEYS.has(key);
  }
  if (HIGH_VALUE_RESTORE_KEYS.has(key)) {
    return false;
  }
  if (
    LOW_VALUE_FILE_KEYS.has(key)
    || SECOND_PASS_LOW_VALUE_FILE_KEYS.has(key)
    || THIRD_PASS_LOW_VALUE_FILE_KEYS.has(key)
    || FOURTH_PASS_LOW_VALUE_FILE_KEYS.has(key)
    || FIFTH_PASS_LOW_VALUE_FILE_KEYS.has(key)
    || SIXTH_PASS_LOW_VALUE_FILE_KEYS.has(key)
    || SEVENTH_PASS_LOW_VALUE_FILE_KEYS.has(key)
    || EIGHTH_PASS_LOW_VALUE_FILE_KEYS.has(key)
    || NINTH_PASS_LOW_VALUE_FILE_KEYS.has(key)
  ) {
    return true;
  }
  if (
    entry.section === 'tax_individual'
    && entry.is_prior_year
    && String(entry.filename || '').includes(TAX_INDIVIDUAL_ARCHIVE_YEAR_TO_PRUNE)
  ) {
    return true;
  }
  if (
    entry.section === 'tax_business'
    && entry.is_prior_year
    && !TAX_BUSINESS_ARCHIVE_KEEP_KEYS.has(key)
  ) {
    return true;
  }
  const patterns = LOW_VALUE_TITLE_PATTERNS_BY_SECTION.get(entry.section) || [];
  const haystack = `${entry.title || ''} ${entry.form_number || ''} ${entry.filename || ''}`;
  return patterns.some((pattern) => pattern.test(haystack));
}

function duplicateKeepScore(entry) {
  const preferredSection = PREFERRED_SECTION_BY_FORM_KEY.get(normalizeFormKey(entry));
  const filename = String(entry.filename || '');

  return [
    preferredSection && entry.section === preferredSection ? 0 : 1,
    isForeignLanguageVariant(entry) ? 1 : 0,
    entry.is_prior_year ? 1 : 0,
    filename.includes('osha_recordkeeping_forms_package') ? 0 : 1,
    filename.startsWith('osha_300__') ? 1 : 0,
    SECTION_PRIORITY.get(entry.section) ?? 999,
    filename,
  ];
}

function compareScore(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

function identifyLowValueEntries(forms) {
  const removals = new Map();
  const bySha = new Map();

  for (const entry of forms) {
    const sha = entry.sha256 || '';
    if (!bySha.has(sha)) {
      bySha.set(sha, []);
    }
    bySha.get(sha).push(entry);
  }

  for (const entries of bySha.values()) {
    if (entries.length < 2) continue;
    let keep = entries[0];
    let keepScore = duplicateKeepScore(keep);
    for (let index = 1; index < entries.length; index += 1) {
      const candidate = entries[index];
      const candidateScore = duplicateKeepScore(candidate);
      if (compareScore(candidateScore, keepScore) < 0) {
        keep = candidate;
        keepScore = candidateScore;
      }
    }

    for (const entry of entries) {
      if (entry === keep) continue;
      removals.set(manifestKey(entry), {
        entry,
        reasons: ['duplicate'],
        keep: manifestKey(keep),
      });
    }
  }

  for (const entry of forms) {
    const key = manifestKey(entry);

    if (isForeignLanguageVariant(entry)) {
      const existing = removals.get(key);
      removals.set(key, {
        entry,
        reasons: [...new Set([...(existing?.reasons || []), 'language'])],
        keep: existing?.keep || null,
      });
    }

    if (isExplicitLowValueArtifact(entry)) {
      const existing = removals.get(key);
      removals.set(key, {
        entry,
        reasons: [...new Set([...(existing?.reasons || []), 'low_value'])],
        keep: existing?.keep || null,
      });
    }
  }

  return [...removals.values()].sort((left, right) => {
    const leftKey = manifestKey(left.entry);
    const rightKey = manifestKey(right.entry);
    return leftKey.localeCompare(rightKey);
  });
}

function pruneDescriptions(removals) {
  if (!existsSync(DESCRIPTIONS_PATH)) return;
  const descriptions = loadJson(DESCRIPTIONS_PATH);
  const currentEntries = descriptions?._entries && typeof descriptions._entries === 'object'
    ? descriptions._entries
    : {};
  const removeKeys = new Set(removals.map(({ entry }) => manifestKey(entry)));
  descriptions._entries = Object.fromEntries(
    Object.entries(currentEntries).filter(([key]) => !removeKeys.has(key)),
  );
  saveJson(DESCRIPTIONS_PATH, descriptions);
}

function pruneTitleOverrides(removals) {
  if (!existsSync(TITLE_OVERRIDES_PATH)) return;
  const titleOverrides = loadJson(TITLE_OVERRIDES_PATH);
  const currentEntries = titleOverrides?._entries && typeof titleOverrides._entries === 'object'
    ? titleOverrides._entries
    : {};
  const removeKeys = new Set(removals.map(({ entry }) => manifestKey(entry)));
  titleOverrides._entries = Object.fromEntries(
    Object.entries(currentEntries).filter(([key]) => !removeKeys.has(key)),
  );
  saveJson(TITLE_OVERRIDES_PATH, titleOverrides);
}

function prunePageCounts(manifestForms) {
  if (!existsSync(PAGE_COUNTS_PATH)) return;
  const pageCounts = loadJson(PAGE_COUNTS_PATH);
  const currentEntries = pageCounts?._entries && typeof pageCounts._entries === 'object'
    ? pageCounts._entries
    : {};
  const activeShas = new Set(
    manifestForms
      .filter((entry) => entry?.ok === true && entry?.sha256)
      .map((entry) => entry.sha256),
  );
  const nextEntries = Object.fromEntries(
    Object.entries(currentEntries)
      .filter(([sha]) => activeShas.has(sha))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  saveJson(PAGE_COUNTS_PATH, {
    _note: pageCounts?._note || 'Keyed by sha256 of each downloaded PDF.',
    _entries: nextEntries,
  });
}

function pruneManifest(manifest, removals) {
  const removeKeys = new Set(removals.map(({ entry }) => manifestKey(entry)));
  const nextForms = (manifest.forms || []).filter((entry) => !removeKeys.has(manifestKey(entry)));
  return {
    ...manifest,
    total: nextForms.length,
    ok: nextForms.filter((entry) => entry?.ok === true).length,
    failed: nextForms.filter((entry) => entry?.ok !== true).length,
    forms: nextForms,
  };
}

function removeCatalogFiles(removals) {
  for (const { entry } of removals) {
    const filePath = resolve(CATALOG_ROOT, entry.section, entry.filename);
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
    const thumbnailPath = filePath.replace(/\.pdf$/i, '.webp');
    if (existsSync(thumbnailPath)) {
      rmSync(thumbnailPath, { force: true });
    }
  }
}

function summarizeReasons(removals) {
  const counts = new Map();
  for (const { reasons } of removals) {
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
  }
  return counts;
}

function printAudit(removals) {
  console.log(`[prune-form-catalog-low-value] flagged ${removals.length} hosted forms`);
  const reasonCounts = summarizeReasons(removals);
  for (const [reason, count] of [...reasonCounts.entries()].sort(([left], [right]) => (
    left.localeCompare(right)
  ))) {
    console.log(`  ${reason.padEnd(10)} ${count}`);
  }
  for (const { entry, reasons, keep } of removals) {
    const suffix = keep ? ` (keep ${keep})` : '';
    console.log(`${manifestKey(entry)} :: ${reasons.join(', ')}${suffix}`);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing manifest at ${MANIFEST_PATH}`);
  }

  const manifest = loadJson(MANIFEST_PATH);
  const forms = Array.isArray(manifest?.forms)
    ? manifest.forms.filter((entry) => entry?.ok === true && entry.section && entry.filename)
    : [];
  const scopedForms = options.sections.size > 0
    ? forms.filter((entry) => options.sections.has(entry.section))
    : forms;

  console.log(`[prune-form-catalog-low-value] auditing ${scopedForms.length} hosted forms`);
  const removals = identifyLowValueEntries(scopedForms);
  printAudit(removals);

  if (!options.write) {
    return;
  }

  removeCatalogFiles(removals);
  const nextManifest = pruneManifest(manifest, removals);
  pruneDescriptions(removals);
  pruneTitleOverrides(removals);
  prunePageCounts(nextManifest.forms || []);
  saveJson(MANIFEST_PATH, nextManifest);
  console.log(
    `[prune-form-catalog-low-value] removed ${removals.length} forms; ${nextManifest.total} remain in manifest`,
  );
}

main().catch((error) => {
  console.error('[prune-form-catalog-low-value] failed:', error);
  process.exitCode = 1;
});
