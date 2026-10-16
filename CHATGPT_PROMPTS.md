# پرامپت‌های ChatGPT / Sora برای سایت Ayvan

این فایل برای ساختن بخش‌هایی است که با پلن رایگان Higgsfield ممکن نبود. مهم‌ترین مورد **ویدیوی ورود به خانه** است که روی اسکرول قرار می‌گیرد.

---

## ۱) ویدیوی ورود به خانه (مهم‌ترین)

**کجا:** در ChatGPT گزینه‌ی Sora (یا sora.com).
**عکس شروع:** فایل `assets/img/exterior.webp` را آپلود کن (اگر webp قبول نکرد، اسکرین‌شات بگیر یا به png تبدیلش کن). این همان ویلایی است که سایت با آن تمام می‌شود، پس ویدیو باید دقیقاً از همین قاب شروع شود.
**تنظیمات:** افقی ۱۶:۹، بالاترین کیفیت، ۱۰ ثانیه، بدون صدا (صدا لازم نیست).

پرامپت (انگلیسی کپی کن):

```
Start exactly on the uploaded image and keep the same villa, light and colours.
One continuous, slow, perfectly smooth steadicam shot, no cuts, constant speed, stable horizon.
The camera glides straight forward across the lawn, up the wide travertine stairs,
through the tall open glass entrance doors, into a warm double-height travertine foyer,
and ends looking into a kitchen with a long travertine island and walnut cabinets,
olive trees visible through glass on the left.
Golden hour, warm interior lights, photorealistic architectural film,
no people, no text, no camera shake, no fast motion.
```

اگر نتیجه پرش یا تغییر ناگهانی داشت، همان را دوباره بساز یا مدت را ۸ ثانیه کن. ویدیوی آرام و بدون کات مهم‌تر از طولانی بودن است.

---

## ۲) (اختیاری) نسخه‌ی باکیفیت‌تر عکس اتاق‌ها

عکس‌های فعلی ۱۳۴۴ پیکسل‌اند. اگر بخواهی روی مانیتورهای بزرگ تیزتر باشند، در ChatGPT هر کدام را با کیفیت بالا و نسبت ۱۶:۹ بساز. عکس فعلی را هم آپلود کن و بگو «same composition, higher resolution, more detail».

| فایل | پرامپت کوتاه |
|---|---|
| `kitchen` | Luxury modern villa kitchen, single long travertine island, walnut cabinetry, brass tap, glass wall to an olive garden, golden afternoon light, photorealistic architectural photography, no people |
| `living` | Double-height living room, travertine fireplace wall, cream boucle sofas, teak slat wall, floor-to-ceiling glass to palms and a reflecting pool at sunset, photorealistic, no people |
| `dining` | Dining room, long dark walnut table, pleated paper pendant, glass slid open to an olive garden, warm late light, photorealistic, no people |
| `bedroom` | Principal bedroom, fluted walnut headboard, sand linen bedding, travertine bedside tables, glass to olive trees at dusk, photorealistic, no people |

---

## بعدش چی؟

فایل‌ها را **در همین گفتگو با Claude بفرست** یا در ریپازیتوری داخل پوشه‌ی `incoming/` آپلود کن. Claude این کار را انجام می‌دهد:

```
tools/add-walkthrough.sh incoming/walkthrough.mp4
```

این اسکریپت ویدیو را به حدود ۱۵۰ فریم تبدیل می‌کند و خودکار به اسکرول وصل می‌کند. در آن حالت، به‌جای زوم فعلی، دوربین واقعاً از پله‌ها بالا می‌رود و وارد خانه می‌شود.
