# Washaholics AI Lead Generation (n8n)

<div dir="rtl">

سیستم کامل پیدا کردن مشتری تجاری در لندن برای Washaholics، داخل n8n خودتان (Docker روی مک).

## چه کار می‌کند

| Workflow | زمان اجرا | کار |
|---|---|---|
| **00 - Setup Google Sheet** | یک بار، دستی | Google Sheet را با تب‌های `Leads` و `Reports` و سرستون‌ها می‌سازد |
| **01 - Daily Lead Generation** | هر روز ۸ صبح (لندن) | جستجو در Google Places (شرکت‌های مدیریت املاک، هتل‌ها، رستوران‌ها، مجتمع‌های تجاری؛ منطقه‌ها هر روز عوض می‌شوند) ← حذف تکراری‌ها نسبت به کل شیت ← خواندن سایت و صفحه تماس برای پیدا کردن ایمیل ← Claude امتیاز ارتباط (۰ تا ۱۰۰) می‌دهد و ایمیل اختصاصی می‌نویسد ← برای بهترین‌ها (حداکثر `DAILY_MAX`) **پیش‌نویس Gmail** ساخته می‌شود ← همه چیز در شیت ثبت می‌شود |
| **02 - Reply & Follow-up Tracker** | هر ۲ ساعت از ۸ تا ۲۰ | تشخیص می‌دهد کدام پیش‌نویس را فرستاده‌اید، پاسخ‌ها و ایمیل‌های برگشتی را پیدا می‌کند، Claude پاسخ را دسته‌بندی می‌کند (علاقه‌مند / سؤال / علاقه‌ای ندارد / لغو / خارج از دفتر)، برای پاسخ‌های مثبت **پیش‌نویس جواب** در همان thread می‌سازد، و اگر بعد از `FOLLOWUP_DAYS` روز جوابی نیامده، **پیش‌نویس پیگیری** آماده می‌کند |
| **03 - Daily Report** | هر روز ۱۸ | گزارش روزانه را به ایمیل خودتان می‌فرستد و در تب `Reports` ذخیره می‌کند |
| **04 - Error Alerts** | خودکار | اگر هر workflow خطا بدهد، به شما ایمیل می‌زند |

> **هیچ ایمیلی به مشتری خودکار ارسال نمی‌شود.** فقط پیش‌نویس ساخته می‌شود. ارسال همیشه با خود شماست. تنها ایمیل‌هایی که خودکار فرستاده می‌شوند گزارش روزانه و هشدار خطا هستند که فقط به `OWNER_EMAIL` (خودتان) می‌روند.

## امنیت کلیدها

- کلیدهای API و ورود Google **فقط** در Credentials خود n8n ذخیره می‌شوند که با `N8N_ENCRYPTION_KEY` رمزنگاری شده‌اند. هیچ کلیدی در این فایل‌ها یا در git نیست.
- `config.env` فقط تنظیمات غیرمحرمانه دارد و در `.gitignore` است.
- `install.sh` از credentialها فقط **id، نام و نوع** را می‌خواند. محتوای رمزنگاری‌شده همان لحظه پاک می‌شود.
- هر کلید فقط به سرویس خودش فرستاده می‌شود. هنگام خواندن سایت‌ها هیچ کلیدی ارسال نمی‌شود.

---

## راه‌اندازی (حدود ۳۰ دقیقه)

### ۱) Google Cloud (یک بار)
1. به https://console.cloud.google.com بروید و یک Project بسازید.
2. در **APIs & Services → Library** این سه را Enable کنید: **Gmail API**، **Google Sheets API**، **Places API (New)**. برای Places باید Billing فعال باشد.
3. **OAuth consent screen**:
   - اگر حساب Google Workspace دارید، User type را **Internal** بگذارید.
   - اگر @gmail.com است، **External** بگذارید و ایمیل خودتان را در Test users اضافه کنید.
4. **Credentials → Create credentials → OAuth client ID → Web application**. در Authorized redirect URIs این را وارد کنید:
   `http://localhost:5678/rest/oauth2-credential/callback`
   Client ID و Client Secret را نگه دارید.
5. **Credentials → Create credentials → API key**. در Restrict key فقط **Places API (New)** را انتخاب کنید.

> اگر حساب gmail.com است و برنامه در حالت Testing بماند، Google هر ۷ روز اتصال را قطع می‌کند. برای جلوگیری، در OAuth consent screen گزینه **Publish app** را بزنید (برای استفاده شخصی نیازی به تأیید Google نیست؛ فقط یک هشدار نمایش داده می‌شود).

### ۲) کلید Claude
از https://console.anthropic.com → API Keys یک کلید بسازید.

### ۳) ساخت ۴ Credential در n8n
در `http://localhost:5678` به **Credentials → Add credential** بروید. نام‌ها باید **دقیقاً** همین‌ها باشند:

| نام credential | نوع | تنظیمات |
|---|---|---|
| `Washaholics - Google Sheets` | Google Sheets OAuth2 API | Client ID/Secret مرحله ۱، بعد **Sign in with Google** |
| `Washaholics - Gmail` | Gmail OAuth2 API | همان Client ID/Secret، بعد **Sign in with Google** |
| `Washaholics - Google Places API Key` | Header Auth | Name: `X-Goog-Api-Key` و Value: کلید Places |
| `Washaholics - Anthropic API Key` | Header Auth | Name: `x-api-key` و Value: کلید Claude |

> پنجره «Connect a model» در صفحه Assistant مربوط به دستیار داخلی n8n است و برای این پروژه لازم نیست.

### ۴) نصب workflowها (در Terminal مک)
```bash
git clone -b claude/sleepy-cray-g6qx3z https://github.com/zerngton/oso.git
```
```bash
cd oso/washaholics-n8n
```
```bash
./install.sh
```
بار اول `config.env` ساخته می‌شود. بازش کنید و دست‌کم `OWNER_EMAIL`، `SENDER_NAME`، `SENDER_PHONE`، `COMPANY_WEBSITE` و `SERVICES` (خدمات دقیق Washaholics) را پر کنید. بعد دوباره اجرا کنید:
```bash
./install.sh
```
اسکریپت کانتینر n8n را خودش پیدا می‌کند. اگر پیدا نکرد، اسمش را بدهید:
```bash
N8N_CONTAINER=n8n ./install.sh
```

### ۵) ساخت Google Sheet
در n8n، workflow **Washaholics 00 - Setup Google Sheet** را باز کنید و **Execute workflow** بزنید. خروجی آخرین node مقدار `spreadsheetId` را نشان می‌دهد. آن را در `config.env` بگذارید (`SHEET_ID="..."`) و دوباره اجرا کنید:
```bash
./install.sh
```
> اگر شیت آماده دارید، دو تب `Leads` و `Reports` با سرستون‌های `LEAD_COLUMNS` و `REPORT_COLUMNS` (در `src/shared.js`) بسازید و ID آن را وارد کنید.

### ۶) تست و فعال‌سازی
1. **01 - Daily Lead Generation** را باز کنید و **Execute workflow** بزنید. حدود ۵ تا ۱۰ دقیقه طول می‌کشد. بعد شیت و پوشه **Drafts** در Gmail را ببینید.
2. **02** و **03** را هم یک بار دستی اجرا کنید.
3. کلید **Active** را برای 01، 02 و 03 روشن کنید. 04 نیازی به فعال‌سازی ندارد.

> بعد از هر `./install.sh`، workflowها خاموش می‌شوند و باید دوباره فعالشان کنید.

---

## کار روزانه شما
1. صبح‌ها در Gmail → **Drafts** پیش‌نویس‌ها را بخوانید، در صورت نیاز ویرایش کنید و **Send** بزنید.
2. Tracker خودش وضعیت را به `Sent` تغییر می‌دهد و پاسخ‌ها را دنبال می‌کند.
3. عصرها گزارش را در ایمیلتان ببینید. ردیف‌های `Replied - Interested` اولویت اول هستند.

### وضعیت‌ها در ستون `status`
`Draft Ready` (منتظر تأیید شما) · `Sent` · `Follow-up Draft Ready` · `Follow-up Sent` · `Replied - Interested` · `Replied - Question` · `Replied - Not Interested` · `Replied - Out of Office` · `Do Not Contact` · `Bounced` · `Qualified - No Email` (مناسب است ولی ایمیلی پیدا نشد؛ تلفن در شیت هست) · `Qualified - Backlog` (مناسب، بیش از سقف روزانه) · `Low Fit` · `Draft Deleted` · `Error` (فردا دوباره امتحان می‌شود)

## تنظیمات مهم (`config.env`)
- `DAILY_MAX` / `DAILY_MIN` / `CANDIDATE_POOL`: تعداد روزانه. اگر کمتر از ۱۰ لید مناسب پیدا شد، `CANDIDATE_POOL` را بیشتر کنید.
- `MIN_SCORE`: حداقل امتیاز Claude برای ساخت پیش‌نویس.
- `SERVICES` و `USP`: متن ایمیل‌ها بر اساس این دو نوشته می‌شود. لطفاً دقیق بنویسید.
- `AI_MODEL` (پیش‌فرض `claude-opus-5-5`) و `AI_EFFORT` (`low`، `medium` یا `high`).
- `EXCLUDE_DOMAINS`: دامنه‌هایی که نباید هدف قرار بگیرند، مثل زنجیره‌های بزرگ.
- زمان‌بندی‌ها با فرمت cron و به وقت لندن هستند.

بعد از هر تغییر، دوباره `./install.sh` را اجرا کنید.

## هزینه تقریبی
- **Google Places**: حدود ۶ جستجو در روز، یعنی ~۱۸۰ در ماه. معمولاً در سقف رایگان ماهانه Google قرار می‌گیرد.
- **Claude**: حدود ۴۰ ارزیابی در روز با Opus 5.5 و effort متوسط، یعنی تقریباً ۱ تا ۲ دلار در روز. با `CANDIDATE_POOL` کمتر یا `AI_EFFORT=low` کاهش می‌یابد.
- Gmail و Sheets رایگان هستند.

## نکات قانونی (UK)
ایمیل B2B به آدرس‌های عمومی شرکت‌ها طبق PECR مجاز است، به شرطی که فرستنده مشخص باشد و امکان انصراف وجود داشته باشد. هر ایمیل یک خط انصراف دارد. کسی که بگوید تماس نگیرید، `Do Not Contact` می‌شود و دیگر پیگیری نمی‌شود. مبنای پردازش داده: legitimate interest (UK GDPR).

## تست
`test/e2e.sh` همه workflowها را در یک n8n موقت در برابر یک سرور شبیه‌سازی‌شده اجرا می‌کند (Places، Sheets، Gmail، Claude و چند سایت ساختگی). هیچ حساب واقعی‌ای استفاده نمی‌شود. ۱۳ بررسی دارد: حذف تکراری، انتخاب ایمیل، رد رقیب، ساخت پیش‌نویس بدون ارسال، تشخیص پاسخ، follow-up، تکراری نشدن در اجرای دوباره و گزارش.

## عیب‌یابی
- **Google Places search failed (HTTP 403)**: کلید Places یا Billing را بررسی کنید و مطمئن شوید Places API (New) فعال است.
- **Claude API failed for every lead**: کلید Claude یا اعتبار حساب را بررسی کنید. در این حالت چیزی در شیت ذخیره نمی‌شود و اجرای بعدی دوباره امتحان می‌کند.
- **HTTP 401 از Sheets یا Gmail**: آن credential را در n8n باز کنید و دوباره **Sign in with Google** بزنید.
- **Requested entity was not found**: مقدار `SHEET_ID` اشتباه است.

</div>

## Layout
```
build.mjs            builds dist/*.json from src/ + config.env (+ credential ids)
install.sh           copies into the n8n container, builds, imports (Docker only)
config.example.env   non-secret settings template
src/shared.js        helpers prepended to every Code node
src/code/*.js        Code node logic
test/mock-server.mjs fake Places / Sheets / Gmail / Claude / websites
test/e2e.sh          end-to-end test in a throwaway n8n
```
