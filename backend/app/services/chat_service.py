# pyrefly: ignore [missing-import]
import google.generativeai as genai
from typing import List, Dict, Any
from app.config import settings
from app.models.conversation import ConversationType


def get_meta_ai_category_catalog(category: str, name: str) -> str:
    cat = (category or "").lower()
    if any(k in cat for k in ["grocery", "supermarket", "general", "kirana", "provision"]):
        return (
            f"🛒 **Products & Catalog at {name}:**\n"
            f"• Fresh Daily Essentials (Dairy, Milk, Bread, Eggs, Butter)\n"
            f"• Grains, Pulses, Rice, Atta & Cooking Oils\n"
            f"• Spices, Masalas & Packaged Snacks\n"
            f"• Beverages, Tea, Coffee & Soft Drinks\n"
            f"• Household Cleaners & Personal Care Products\n\n"
            f"📦 *Send your item list here on WhatsApp to check stock or get home delivery!*"
        )
    elif any(k in cat for k in ["restaurant", "cafe", "food", "bakery", "sweet", "hotel", "dine", "pizza", "burger"]):
        return (
            f"🍽️ **Menu & Specials at {name}:**\n"
            f"• Chef's Special Main Courses & Freshly Prepared Delicacies\n"
            f"• Quick Bites, Snacks, Starters & Beverages\n"
            f"• Desserts, Fresh Pastries & Sweets\n"
            f"• Daily Combo Meals & Family Packs at discount rates\n\n"
            f"🛵 *Order directly via WhatsApp for quick takeaway pickup or doorstep delivery!*"
        )
    elif any(k in cat for k in ["clothing", "apparel", "fashion", "tailor", "garment", "textile", "boutique"]):
        return (
            f"👗 **Collection & Offerings at {name}:**\n"
            f"• Latest Trend Casual & Ethnic Wear for Men, Women & Kids\n"
            f"• Designer Festive & Wedding Outfits\n"
            f"• Custom Tailoring, Alterations & Perfect Fitting Services\n"
            f"• Premium Fabrics, Sarees, Suits & Ready-to-Wear\n\n"
            f"✨ *Ask for photos, sizes, or custom tailoring consultations on WhatsApp!*"
        )
    elif any(k in cat for k in ["pharmacy", "medical", "chemist", "health", "hospital"]):
        return (
            f"💊 **Medicines & Health Care at {name}:**\n"
            f"• 100% Genuine Prescription & OTC Medicines\n"
            f"• Baby Care, Nutritional Supplements & Vitamins\n"
            f"• First Aid, Diagnostic Kits & Home Health Monitors\n"
            f"• Personal Hygiene & Surgical Supplies\n\n"
            f"📋 *Upload / send your doctor prescription photo on WhatsApp for instant medicine packing & delivery!*"
        )
    elif any(k in cat for k in ["electronics", "mobile", "computer", "repair", "gadget", "electrical"]):
        return (
            f"📱 **Gadgets & Electronics at {name}:**\n"
            f"• Latest Smartphones, Laptops, Audio & Accessories\n"
            f"• Cables, Chargers, Power Banks & Screen Protectors\n"
            f"• Expert Fast Repair, Screen Replacement & Servicing\n"
            f"• Brand Warranties & Exchange Bonuses Available\n\n"
            f"⚡ *Inquire about gadget models, repair estimates, and best deals right here!*"
        )
    else:
        return (
            f"🛍️ **Services & Products at {name}:**\n"
            f"• Top quality selections in {category or 'our catalog'}\n"
            f"• Guaranteed authentic products with competitive local pricing\n"
            f"• Custom orders, bulk inquiries & personalized customer service\n\n"
            f"💬 *Message us what you need and we will confirm price and availability right away!*"
        )


def generate_ai_response(
    conversation_type: ConversationType,
    business_name: str,
    business_category: str,
    history: List[Dict[str, str]],
    user_message: str
) -> str:
    name = business_name or "your shop"
    cat = business_category or "Local Business"
    lower_msg = user_message.lower().strip()

    # 1. Try OpenAI AI if configured
    openai_key = getattr(settings, 'OPENAI_API_KEY', '')
    if openai_key and openai_key.strip() and not getattr(settings, 'USE_RULE_BASED_CHAT', False):
        try:
            import requests
            base_url = getattr(settings, 'OPENAI_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
            model_name = getattr(settings, 'OPENAI_MODEL', 'gpt-4o-mini')
            url = f"{base_url}/chat/completions"
            headers = {
                "Authorization": f"Bearer {openai_key.strip()}",
                "Content-Type": "application/json"
            }
            system_instruction = (
                f"You are the official AI Website Consultant for 'Lexon IT' (Website Presence Detection & Modern Web Design Company). "
                f"You are chatting with the owner/manager of '{name}', which is a '{cat}'. "
                f"Lexon IT specializes in high-quality, mobile-friendly websites, online ordering, and digital presence at very low, affordable cost (packages from ₹2,999 to ₹7,999) with guaranteed 100% customer satisfaction and 48-hour delivery. "
                f"Your goal is to politely answer the shop owner's questions, explain website features, provide pricing details, offer custom design demos, and guide them to build/improve their website with Lexon IT. "
                f"Format your response cleanly with WhatsApp-friendly styling (bullet points, bold key terms, friendly emojis). "
                f"Keep responses concise (under 120 words), professional, and persuasive."
            )
            openai_messages = [{"role": "system", "content": system_instruction}]
            for msg in history[-6:]:
                role = "assistant" if msg.get("sender") == "ASSISTANT" else "user"
                openai_messages.append({"role": role, "content": msg.get("text", "")})
            openai_messages.append({"role": "user", "content": user_message})

            payload = {
                "model": model_name,
                "messages": openai_messages,
                "temperature": 0.7,
                "max_tokens": 250
            }
            res = requests.post(url, headers=headers, json=payload, timeout=10)
            if res.status_code == 200:
                data = res.json()
                reply_text = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if reply_text:
                    return reply_text
        except Exception as e:
            print("OpenAI API error in chat_service:", e)

    # 2. Try Gemini AI if configured
    if settings.GEMINI_API_KEY and not settings.USE_RULE_BASED_CHAT:
        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel((getattr(settings, "GEMINI_MODEL", "") or "gemini-2.5-flash").strip())

            system_instruction = (
                f"You are the official AI Website Consultant for 'Lexon IT' (Website Presence Detection & Modern Web Design Company). "
                f"You are chatting on WhatsApp with the owner/manager of '{name}', which is a '{cat}'. "
                f"Lexon IT specializes in high-quality, mobile-friendly websites, online ordering, and digital presence at very low, affordable cost with guaranteed 100% customer satisfaction. "
                f"Your goal is to politely answer the shop owner's questions, explain website features, provide low-cost pricing details, offer custom design demos, and guide them to build/improve their website with Lexon IT. "
                f"Format your response with WhatsApp-friendly formatting (clean bullet points, bold key terms, friendly emojis). "
                f"Keep responses concise (under 120 words), professional, and persuasive."
            )

            prompt = f"{system_instruction}\n\nChat History:\n"
            for msg in history[-6:]:
                prompt += f"{msg['sender']}: {msg['text']}\n"
            prompt += f"Shop Owner: {user_message}\nLexon IT AI Consultant:"

            response = model.generate_content(prompt)
            if response and response.text:
                return response.text.strip()
        except Exception as e:
            print("Gemini API error in chat_service:", e)

    # ── Lexon IT Intelligent Dynamic Fallback Engine ──

    # 1. Shop Owner says they need / want a website
    if any(k in lower_msg for k in ["need website", "want website", "need a website", "want a website", "make website", "create website", "build website", "i need", "interested", "yes"]):
        return (
            f"🎉 **Thank you for your interest in Lexon IT!**\n\n"
            f"We would love to create a modern, high-converting website for **{name}** ({cat})!\n\n"
            f"✨ **What we provide for {name}:**\n"
            f"• 📱 100% Mobile & Desktop Responsive Design\n"
            f"• 🛒 Online Product Catalog & WhatsApp Ordering\n"
            f"• 📍 Google Maps Location & Local SEO Boost\n"
            f"• ⚡ Superfast 48-Hour Delivery at Low Cost\n\n"
            f"Would you like us to share a quick custom demo or schedule a 5-minute call?"
        )

    # 2. Pricing, Cost, Rates & Budget
    if any(k in lower_msg for k in ["cost", "price", "pricing", "rate", "how much", "charges", "cheap", "low cost", "budget", "package"]):
        return (
            f"💼 **Lexon IT Low-Cost Website Packages for {name}:**\n\n"
            f"• 🚀 **Starter Shop Website**: Starting from just **₹2,999** (Single page, contact, Google Map & WhatsApp button)\n"
            f"• 🌟 **Business Growth Pack**: **₹4,999** (Multi-page, product catalog, online inquiries & SEO)\n"
            f"• 🛍️ **E-Commerce / Ordering Store**: **₹7,999** (Online menu/store, payment gateway & WhatsApp orders)\n\n"
            f"✅ 100% Satisfaction Guarantee with free 1-year basic support! Which package fits your needs best?"
        )

    # 3. Features, Demo, Portfolio & Samples
    if any(k in lower_msg for k in ["demo", "sample", "portfolio", "feature", "example", "show me", "template"]):
        return (
            f"🎨 **Lexon IT Custom Designs for {cat}:**\n\n"
            f"We have tailored modern designs specifically crafted for {cat} businesses like **{name}**!\n\n"
            f"• Fast loading with clean modern visuals\n"
            f"• 1-Click WhatsApp chat & Direct Calling\n"
            f"• Customer reviews & Google rating integration\n"
            f"• Social media integration (Instagram, Facebook)\n\n"
            f"We can create a **free initial mockup design** for {name} today. Should we start?"
        )

    # 4. Timings, Delivery Duration & Process
    if any(k in lower_msg for k in ["how long", "duration", "time", "when", "delivery", "process", "step", "how it works"]):
        return (
            f"⚡ **Fast 3-Step Process with Lexon IT:**\n\n"
            f"1️⃣ **Share Details**: Send us your shop photos, services/menu, and address.\n"
            f"2️⃣ **We Build & Review**: We design your website within **48 hours**.\n"
            f"3️⃣ **Go Live**: Review changes and launch your live website with your custom domain!\n\n"
            f"Ready to get started? Send us your shop logo or details right here!"
        )

    # 5. Greetings & Hello from Shop Owner
    if any(k in lower_msg for k in ["hi", "hello", "hey", "namaste", "good morning", "good evening", "good afternoon"]):
        return (
            f"👋 Hello! Thank you for connecting with **Lexon IT**.\n\n"
            f"We noticed **{name}** on our Website Presence Detection system and are excited to help you grow your business online with a modern, low-cost website.\n\n"
            f"How can we assist you today?\n"
            f"• 💰 Check Website Packages & Pricing\n"
            f"• 🎨 View Demos for {cat}\n"
            f"• 📞 Schedule a Free Consultation Call"
        )

    # 6. Contact / Call Back Request
    if any(k in lower_msg for k in ["call", "contact", "phone", "number", "speak", "talk"]):
        return (
            f"📞 **Lexon IT Support & Consultation:**\n\n"
            f"Our website specialist will be delighted to talk with you! Please share your preferred call time and number, or call our Lexon IT team directly. We are ready to assist {name}!"
        )

    # 7. Generic Intelligent Lexon IT Response
    return (
        f"🤝 **Lexon IT Website Solutions for {name}:**\n\n"
        f"Thank you for your message! At Lexon IT, our goal is to provide high quality, affordable websites with guaranteed satisfaction for {cat} stores like **{name}**.\n\n"
        f"Please let us know your requirements or questions about pricing, features, or timelines, and our team will assist you immediately!"
    )


