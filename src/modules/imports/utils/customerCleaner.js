/**
 * Normalizes and validates a single customer row.
 * Returns cleaned object or throws an error.
 */
export function cleanCustomerRow(row) {
  if (!row || Object.keys(row).length === 0) {
    throw new Error('Empty row');
  }

  // Trim whitespace for all fields
  const rawFirstName = (row.firstName || row.first_name || '').trim();
  const rawLastName = (row.lastName || row.last_name || '').trim();
  const rawEmail = (row.email || '').trim();
  const rawPhone = (row.phone || '').trim();
  const rawGender = (row.gender || '').trim();
  const rawDob = (row.dateOfBirth || row.date_of_birth || row.dob || '').trim();
  const rawExternalId = (row.externalId || row.external_id || '').trim();

  // Validate required: firstName
  if (!rawFirstName) {
    throw new Error('Missing required field: firstName');
  }

  // Normalize Email
  let email = null;
  if (rawEmail) {
    email = rawEmail.toLowerCase();
    // basic email regex validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Invalid email format: ${rawEmail}`);
    }
  }

  // Normalize Phone: remove non-digits
  let phone = null;
  if (rawPhone) {
    phone = rawPhone.replace(/[^\d]/g, '');
    if (phone.length < 5 || phone.length > 15) {
      throw new Error(`Invalid phone format: ${rawPhone}`);
    }
  }

  // Require email OR phone
  if (!email && !phone) {
    throw new Error('Customer record must contain either email or phone');
  }

  // Normalize Gender
  let gender = null;
  if (rawGender) {
    const gUpper = rawGender.toUpperCase();
    if (['MALE', 'FEMALE', 'OTHER', 'M', 'F'].includes(gUpper)) {
      if (gUpper === 'M') gender = 'MALE';
      else if (gUpper === 'F') gender = 'FEMALE';
      else gender = gUpper;
    } else {
      gender = 'OTHER';
    }
  }

  // Parse Date of Birth
  let dateOfBirth = null;
  if (rawDob) {
    const parsedDate = new Date(rawDob);
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid dateOfBirth: ${rawDob}`);
    }
    dateOfBirth = parsedDate;
  }

  const externalId = rawExternalId || null;

  return {
    firstName: rawFirstName,
    lastName: rawLastName || null,
    email,
    phone,
    gender,
    dateOfBirth,
    externalId
  };
}
