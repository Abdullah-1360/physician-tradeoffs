/**
 * Configurable Job Field Settings Manager
 * Supports dynamic requirement rules (required vs optional), visibility, and defaults
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('./utils');

const SETTINGS_FILE = path.resolve(__dirname, '../data/job_field_settings.json');

const DEFAULT_SETTINGS = {
  preset: 'standard', // 'standard' | 'strict' | 'flexible' | 'custom'
  fields: {
    title: {
      key: 'title',
      label: 'Job Title',
      required: true,
      enabled: true,
      category: 'identity',
      description: 'Medical position title (e.g. Family Physician, Consultant Dermatologist)',
      placeholder: 'e.g. Full-Time Family Physician (FHO Group Practice)',
    },
    company: {
      key: 'company',
      label: 'Clinic / Organization Name',
      required: true,
      enabled: true,
      category: 'identity',
      description: 'Practice name or hospital health network',
      placeholder: 'e.g. Yorkville Medical Associates',
    },
    specialty: {
      key: 'specialty',
      label: 'Medical Specialty',
      required: true,
      enabled: true,
      category: 'identity',
      description: 'Clinical discipline',
      defaultValue: 'Family Medicine',
    },
    employment_type: {
      key: 'employment_type',
      label: 'Employment Type',
      required: true,
      enabled: true,
      category: 'identity',
      description: 'Full-time, Locum, Part-time, Permanent',
      defaultValue: 'full-time',
    },
    city: {
      key: 'city',
      label: 'City / GTA Neighborhood',
      required: true,
      enabled: true,
      category: 'location',
      description: 'Downtown Toronto, North York, Markham, Mississauga, etc.',
      defaultValue: 'Downtown Toronto',
    },
    street_address: {
      key: 'street_address',
      label: 'Street Address',
      required: false,
      enabled: true,
      category: 'location',
      description: 'Physical clinic address for proximity mapping',
      placeholder: 'e.g. 150 Bloor Street West, Suite 400',
    },
    annualized_salary: {
      key: 'annualized_salary',
      label: 'Estimated Annual Gross ($ CAD)',
      required: false,
      enabled: true,
      category: 'compensation',
      description: 'Estimated gross annual billings before practice overhead',
      placeholder: 'e.g. 485000',
    },
    physician_split_pct: {
      key: 'physician_split_pct',
      label: 'Physician Fee Split (%)',
      required: false,
      enabled: true,
      category: 'compensation',
      description: 'Physician percentage share of gross billings',
      defaultValue: 75,
    },
    signing_bonus: {
      key: 'signing_bonus',
      label: 'Signing Incentive Bonus ($ CAD)',
      required: false,
      enabled: true,
      category: 'compensation',
      description: 'Lump-sum signing or recruitment incentive',
      placeholder: 'e.g. 25000',
    },
    contact_emails: {
      key: 'contact_emails',
      label: 'Clinic Coordinator / Direct Contact Email',
      required: true,
      enabled: true,
      category: 'contact',
      description: 'Direct email for in-app physician contact channel',
      placeholder: 'e.g. recruitment@clinicdomain.ca',
    },
    contact_phone: {
      key: 'contact_phone',
      label: 'Clinic Telephone Number',
      required: false,
      enabled: true,
      category: 'contact',
      description: 'Direct telephone line for candidate inquiries',
      placeholder: 'e.g. (416) 555-0199',
    },
    emr_system: {
      key: 'emr_system',
      label: 'EMR System Environment',
      required: false,
      enabled: true,
      category: 'clinical',
      description: 'Electronic Medical Record platform',
      defaultValue: 'Telus PS Suite',
    },
    patient_volume: {
      key: 'patient_volume',
      label: 'Patient Volume / Waitlist Status',
      required: false,
      enabled: true,
      category: 'clinical',
      description: 'Roster availability and daily patient flow',
      defaultValue: 'Turnkey active roster with immediate waitlist',
    },
    valid_through: {
      key: 'valid_through',
      label: 'Posting Validity / Expiry Date',
      required: false,
      enabled: true,
      category: 'clinical',
      description: 'Date through which the position remains active',
    },
    full_description_text: {
      key: 'full_description_text',
      label: 'Full Practice Description & Details',
      required: false,
      enabled: true,
      category: 'clinical',
      description: 'Complete practice overview, clinical support, and scope of care',
      placeholder: 'Detail practice environment, nurse/MOA support, and call schedule...',
    },
    corridor: {
      key: 'corridor',
      label: 'Regional Corridor',
      required: false,
      enabled: true,
      category: 'location',
      description: 'Ontario corridor (West Corridor, North Corridor, East Corridor, Northeast Corridor, GTA Core)',
      defaultValue: 'GTA Core',
    },
    nrrri_incentive_amount: {
      key: 'nrrri_incentive_amount',
      label: 'NRRRI Grant Amount ($ CAD)',
      required: false,
      enabled: true,
      category: 'compensation',
      description: 'Northern & Rural Recruitment and Retention Initiative incentive grant over 4 years',
      placeholder: 'e.g. 84960',
    },
    pro_ros_status: {
      key: 'pro_ros_status',
      label: 'Practice Ready / Return of Service Status',
      required: false,
      enabled: true,
      category: 'identity',
      description: 'PRO / ROS designation (Confirmed PRO, PRO Possible, Excluded)',
      defaultValue: 'PRO Possible',
    },
  },
  defaults: {
    province: 'ON',
    defaultSpecialty: 'Family Medicine',
    defaultSplit: 75,
    defaultCommuteRadiusKm: 40,
    validityDurationDays: 90,
  },
};

class SettingsManager {
  constructor() {
    this.settings = this.loadSettings();
  }

  loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const mergedFields = {};
        for (const [key, defaultField] of Object.entries(DEFAULT_SETTINGS.fields)) {
          mergedFields[key] = {
            ...defaultField,
            ...(parsed.fields && parsed.fields[key] ? parsed.fields[key] : {}),
          };
        }
        return {
          preset: parsed.preset || DEFAULT_SETTINGS.preset,
          fields: mergedFields,
          defaults: { ...DEFAULT_SETTINGS.defaults, ...(parsed.defaults || {}) },
          updated_at: parsed.updated_at || new Date().toISOString(),
        };
      }
    } catch (err) {
      logger.warn(`Could not load settings file: ${err.message}. Using defaults.`);
    }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  saveSettings(newSettings) {
    try {
      const mergedFields = {};
      for (const [key, currentField] of Object.entries(this.settings.fields)) {
        mergedFields[key] = {
          ...currentField,
          ...(newSettings.fields && newSettings.fields[key] ? newSettings.fields[key] : {}),
        };
      }
      this.settings = {
        preset: newSettings.preset || 'custom',
        fields: mergedFields,
        defaults: { ...this.settings.defaults, ...(newSettings.defaults || {}) },
        updated_at: new Date().toISOString(),
      };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2), 'utf-8');
      logger.success('Job field settings updated and saved to disk.');
      return this.settings;
    } catch (err) {
      logger.error(`Failed to save settings: ${err.message}`);
      throw err;
    }
  }

  getSettings() {
    return this.settings;
  }

  /**
   * Validates a job submission against currently configured requirement rules
   * @param {Object} jobData
   * @returns {{ isValid: boolean, errors: string[] }}
   */
  validateJobSubmission(jobData = {}) {
    const errors = [];
    const fields = this.settings.fields;

    for (const [key, fieldConfig] of Object.entries(fields)) {
      if (fieldConfig.enabled !== false && fieldConfig.required === true) {
        const val = jobData[key];
        const isMissing =
          val === undefined ||
          val === null ||
          (typeof val === 'string' && val.trim().length === 0) ||
          (Array.isArray(val) && val.length === 0) ||
          (typeof val === 'number' && isNaN(val));

        if (isMissing) {
          errors.push(`Field '${fieldConfig.label}' (${key}) is required by current configuration.`);
        }
      }
    }

    // Email format validation if provided
    if (jobData.contact_emails) {
      const emailList = Array.isArray(jobData.contact_emails)
        ? jobData.contact_emails
        : [jobData.contact_emails];

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      emailList.forEach((e) => {
        if (e && !emailRegex.test(String(e).trim())) {
          errors.push(`Invalid email format: '${e}'.`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

const settingsManager = new SettingsManager();

module.exports = {
  settingsManager,
  DEFAULT_SETTINGS,
};
