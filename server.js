require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware — Allow all origins (including file:// protocol during local testing)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
}));
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Create Nodemailer Transporter using Mailgun SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailgun.org',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false, // TLS via port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verify SMTP Connection on server start
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Mailgun SMTP Connection Error:', error.message);
  } else {
    console.log('✅ Mailgun SMTP Server is ready to send emails!');
  }
});

// Helper to format phone number for WhatsApp API (ensures country code '91' for 10-digit numbers)
function formatWhatsAppPhone(phone) {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
}

// Send WhatsApp Enquiry via Bluesparc Gateway API
async function sendWhatsAppEnquiry(leadData) {
  const storeUrl = process.env.WA_API_URL || 'https://www.console.bluesparc.in/api/enquiry/store';
  const apiToken = process.env.API_ACCESS_TOKEN || '54af7a83c6d0d996ae586aa386f8a25c788c02cea0bf5365a103aae23cd16895';
  const formattedPhone = formatWhatsAppPhone(leadData.phone || '8072834113');

  const payload = {
    businessName: leadData.business || leadData.name || 'N/A',
    businessTypeId: '1',
    email: leadData.email || 'sales@blueconnect.com',
    mobileNumber: formattedPhone,
    noOfStores: '0'
  };

  try {
    console.log(`📱 Sending WhatsApp message for ${formattedPhone} via Bluesparc Gateway...`);
    const res = await fetch(storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log('✅ WhatsApp API Response:', data);
    return data;
  } catch (e) {
    console.error('❌ WhatsApp API Error:', e.message);
  }
}

// Lead Submission API Route
app.post('/api/lead', async (req, res) => {
  try {
    const { business, name, email, phone, has_waba, notes, _gotcha } = req.body;

    // Honeypot check for spam bots
    if (_gotcha) {
      return res.status(200).json({ success: true, message: 'Lead received' });
    }

    if (!name || !email || !phone || !business) {
      return res.status(400).json({ success: false, message: 'Required fields missing.' });
    }

    const mailOptions = {
      from: `"BlueConnect Leads" <${process.env.SMTP_USER}>`,
      to: process.env.TO_EMAIL || 'sales@blueconnect.com',
      replyTo: email,
      subject: `🚀 New BlueConnect Lead: ${business} (${name})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 24px; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #2563eb; margin-top: 0;">New Lead Request from BlueConnect</h2>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;">
          
          <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569; width: 180px;">Business Name:</td>
              <td style="padding: 8px 0; color: #0f172a;">${business}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569;">Contact Name:</td>
              <td style="padding: 8px 0; color: #0f172a;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569;">Email Address:</td>
              <td style="padding: 8px 0; color: #2563eb;"><a href="mailto:${email}">${email}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569;">Phone Number:</td>
              <td style="padding: 8px 0; color: #0f172a;"><a href="tel:${phone}">${phone}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569;">WhatsApp API Status:</td>
              <td style="padding: 8px 0; color: #0f172a;">${has_waba || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #475569;">Additional Notes:</td>
              <td style="padding: 8px 0; color: #0f172a;">${notes || 'None provided'}</td>
            </tr>
          </table>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0 12px;">
          <p style="font-size: 12px; color: #64748b; margin: 0; text-align: center;">
            Sent automatically from your BlueConnect Landing Page.
          </p>
        </div>
      `
    };

    // 1. Send Email Notification
    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Lead email sent successfully to ${process.env.TO_EMAIL} for ${business}`);
    } catch (emailErr) {
      console.error('⚠️ Lead email error:', emailErr.message);
    }

    // 2. Send WhatsApp Message via Bluesparc Gateway
    const waResult = await sendWhatsAppEnquiry({ business, name, email, phone });

    return res.status(200).json({
      success: true,
      message: 'Lead submitted successfully!',
      waEnquiry: waResult
    });
  } catch (error) {
    console.error('❌ Failed to process lead submission:', error);
    return res.status(500).json({ success: false, message: 'Failed to process lead. Please try again later.' });
  }
});

// Fallback to serve landing page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 BlueConnect Server running on http://localhost:${PORT}`);
});
