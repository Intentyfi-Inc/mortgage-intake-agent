/**
 * Gemini tool declarations for the mortgage intake agent.
 * These define the functions Gemini can call during conversation.
 */

export const toolDeclarations = [
  {
    name: 'init_application',
    description: 'Initialize a new mortgage application in Intentyfi. Call this at the very beginning when starting a new application. Pass the loan type (NEW or REFI).',
    parameters: {
      type: 'OBJECT',
      properties: {
        loanType: {
          type: 'STRING',
          description: 'Type of loan: "NEW" for new mortgage or "REFI" for refinancing.',
          enum: ['NEW', 'REFI'],
        },
      },
      required: ['loanType'],
    },
  },
  {
    name: 'update_application',
    description: 'Update mortgage application fields in Intentyfi. Use this to set property value, down payment, loan product, urgency, and other application-level fields. Only include fields that are being set or changed.',
    parameters: {
      type: 'OBJECT',
      properties: {
        PropertyValue: { type: 'NUMBER', description: 'Purchase price of the property.' },
        DownPayment: { type: 'NUMBER', description: 'Down payment amount in dollars.' },
        SelectedLoanProduct: {
          type: 'STRING',
          description: 'Selected loan product.',
          enum: ['FIXED_CONFORMING_30YR', 'FIXED_CONFORMING_15YR', 'FIXED_JUMBO_30YR', 'FIXED_JUMBO_15YR'],
        },
        Urgency: {
          type: 'STRING',
          description: 'How soon the loan is needed.',
          enum: ['IMMEDIATE', 'MONTHS_3', 'EXPLORING'],
        },
        PMIIsAgreeble: { type: 'BOOLEAN', description: 'Whether the user agrees to PMI if required.' },
        MonthlyTI: { type: 'NUMBER', description: 'Monthly taxes and insurance estimate.' },
      },
    },
  },
  {
    name: 'update_borrower',
    description: 'Update borrower information. Pass the borrower ObjectID and fields to update. Use this for primary borrower details like name, email, and address.',
    parameters: {
      type: 'OBJECT',
      properties: {
        borrowerObjectId: { type: 'NUMBER', description: 'The ObjectID of the borrower to update.' },
        FirstName: { type: 'STRING', description: 'Borrower first name.' },
        LastName: { type: 'STRING', description: 'Borrower last name.' },
        Email: { type: 'STRING', description: 'Borrower email address.' },
        EmploymentStatus: {
          type: 'STRING',
          description: 'Employment type.',
          enum: ['W2', 'SELF', 'BUSINESS'],
        },
        AnnualIncome: { type: 'NUMBER', description: 'Annual gross income.' },
        StreetAddress: { type: 'STRING', description: 'Street address.' },
        City: { type: 'STRING', description: 'City.' },
        State: { type: 'STRING', description: 'US state abbreviation (e.g. CA, NY, TX).' },
      },
      required: ['borrowerObjectId'],
    },
  },
  {
    name: 'update_employment',
    description: 'Update employment details for a borrower.',
    parameters: {
      type: 'OBJECT',
      properties: {
        borrowerObjectId: { type: 'NUMBER', description: 'The ObjectID of the borrower.' },
        EmployerName: { type: 'STRING', description: 'Name of employer.' },
        Duration: { type: 'NUMBER', description: 'Years at current employer.' },
        YearlySalary: { type: 'NUMBER', description: 'Yearly base salary.' },
        YearlyBonus: { type: 'NUMBER', description: 'Yearly bonus amount.' },
      },
      required: ['borrowerObjectId'],
    },
  },
  {
    name: 'add_coborrower',
    description: 'Add a co-borrower to the mortgage application.',
    parameters: {
      type: 'OBJECT',
      properties: {
        FirstName: { type: 'STRING', description: 'Co-borrower first name.' },
        LastName: { type: 'STRING', description: 'Co-borrower last name.' },
        Email: { type: 'STRING', description: 'Co-borrower email.' },
        EmploymentStatus: {
          type: 'STRING',
          description: 'Employment type.',
          enum: ['W2', 'SELF', 'BUSINESS'],
        },
        AnnualIncome: { type: 'NUMBER', description: 'Annual gross income.' },
      },
      required: ['FirstName', 'LastName'],
    },
  },
  {
    name: 'add_liability',
    description: 'Add a liability (existing debt) to the application. Examples: car loan, credit card, student loan, alimony.',
    parameters: {
      type: 'OBJECT',
      properties: {
        Type: {
          type: 'STRING',
          description: 'Type of liability.',
          enum: ['CAR_LOAN', 'CREDIT_CARD', 'ALIMONY', 'STUDENT_LOAN', 'OTHER'],
        },
        CreditorName: { type: 'STRING', description: 'Name of creditor.' },
        MonthlyPayment: { type: 'NUMBER', description: 'Monthly payment amount.' },
        CurrentBalance: { type: 'NUMBER', description: 'Current outstanding balance.' },
      },
      required: ['Type', 'MonthlyPayment'],
    },
  },
  {
    name: 'add_asset',
    description: 'Add a financial asset to the application.',
    parameters: {
      type: 'OBJECT',
      properties: {
        Type: {
          type: 'STRING',
          description: 'Type of asset.',
          enum: ['CASH', 'INVESTMENT', 'REAL_ESTATE', 'VEHICLE', 'BUSINESS', 'OTHER'],
        },
        Description: { type: 'STRING', description: 'Description of the asset.' },
        InstitutionName: { type: 'STRING', description: 'Bank or brokerage name.' },
        Value: { type: 'NUMBER', description: 'Market value of the asset.' },
      },
      required: ['Type', 'Value'],
    },
  },
  {
    name: 'updateDocRequirement',
    description: 'Mark a document requirement as provided after the applicant uploads a matching file (for example W-2, tax return, bank statement, or P&L).',
    parameters: {
      type: 'OBJECT',
      properties: {
        reqCode: {
          type: 'STRING',
          description: 'The requirement code to update.',
          enum: ['W2_TWO_YEARS', 'TAXES_TWO_YEARS', 'PROFIT_LOSS_STATEMENT', 'BANK_STATEMENTS', 'SOFT_CREDIT_CHECK'],
        },
        status: {
          type: 'STRING',
          description: 'New requirement status. Use PROVIDED when a matching document is uploaded.',
          enum: ['PENDING', 'PROVIDED', 'VERIFIED', 'INVALID'],
        },
      },
      required: ['reqCode'],
    },
  },
  {
    name: 'check_eligibility',
    description: 'Fetch the current mortgage application from Intentyfi to check eligibility, LTV, DTI, PMI status, available loan products, and all computed values. Call this after setting key financial parameters.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'explain_ineligibility',
    description: 'When the applicant is NOT eligible, call this to get a detailed explanation of WHY from Intentyfi. Returns a reasoning tree explaining the ineligibility.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_application_summary',
    description: 'Fetch the full mortgage application with all relations (borrowers, assets, liabilities, requirements) for a final summary presentation.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'request_soft_credit_check_consent',
    description: 'Request consent from the applicant to perform a soft credit check. Ask for required information: full name, date of birth, SSN (or last 4 digits), and current address. This must be called before execute_soft_credit_check.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fullName: { type: 'STRING', description: 'Applicants full name (optional if asking user).' },
        dateOfBirth: { type: 'STRING', description: 'Date of birth in YYYY-MM-DD format (optional if asking user).' },
        ssn: { type: 'STRING', description: 'SSN or last 4 digits (optional if asking user).' },
        currentAddress: { type: 'STRING', description: 'Current residential address (optional if asking user).' },
        consentGiven: { type: 'BOOLEAN', description: 'Has the applicant explicitly given consent to proceed with soft credit check?' },
      },
    },
  },
  {
    name: 'execute_soft_credit_check',
    description: 'Execute the soft credit check with the applicant information. Use this AFTER request_soft_credit_check_consent has been called and consent obtained. Returns credit score, credit tier, and other credit profile information.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fullName: { type: 'STRING', description: 'Applicants full name.' },
        dateOfBirth: { type: 'STRING', description: 'Date of birth in YYYY-MM-DD format.' },
        ssn: { type: 'STRING', description: 'SSN or last 4 digits.' },
        currentAddress: { type: 'STRING', description: 'Current residential address.' },
      },
      required: ['fullName', 'dateOfBirth', 'ssn', 'currentAddress'],
    },
  },
];
