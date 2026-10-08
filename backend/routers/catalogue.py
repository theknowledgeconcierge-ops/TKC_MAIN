from fastapi import APIRouter

from models.catalogue import Book, CatalogueResponse

router = APIRouter()

BOOKS = [
    Book(
        id="the-first-table",
        slug="the-first-table",
        title="The First Table",
        subtitle="The Complete Journey From Restaurant Idea to First Customer",
        author="Rakesh Chauhan",
        pages=47,
        selling_price_inr=249,
        original_price_inr=499,
        description="A practical handbook for the decisions between a restaurant idea and the first paying customer—from concept and location to economics, approvals, hiring and launch.",
        topics=["Concept development", "Location evaluation", "Opening budgets", "Menu planning", "Approvals & vendors", "Soft launch"],
        toc=["The Idea", "The Proof", "The Promise", "The Build", "The Opening", "Restaurant field workbook"],
        pdf_url="https://customer-assets-rejwkqb3.emergentagent.net/job_business-wisdom-5/artifacts/f0d2fa25d6f5d5b2_The%20First%20Table.pdf",
    ),
    Book(
        id="the-full-table",
        slug="the-full-table",
        title="The Full Table",
        subtitle="The Journey to Sustained Success and Customer Loyalty",
        author="Rakesh Chauhan",
        pages=53,
        selling_price_inr=249,
        original_price_inr=499,
        description="A focused guide to discovery, local demand, restaurant marketing, customer relationships and the systems that encourage the next visit.",
        topics=["Local discovery", "Instagram marketing", "Creator collaborations", "Offers", "Delivery marketing", "Customer retention"],
        toc=["The Guest and the Journey", "The Acquisition Toolkit", "The Repeat Visit", "The Evidence and the Plan", "Restaurant marketing workbook"],
        pdf_url="https://customer-assets-rejwkqb3.emergentagent.net/job_business-wisdom-5/artifacts/08d9ea094c4a05d0_The%20Full%20Table.pdf",
    ),
    Book(
        id="behind-the-kitchen-door",
        slug="behind-the-kitchen-door",
        title="Behind the Kitchen Door",
        subtitle="The People and Systems That Keep Restaurants Running",
        author="Rakesh Chauhan",
        pages=64,
        selling_price_inr=249,
        original_price_inr=499,
        description="An operating handbook about people, responsibilities, processes and repeatable systems for consistent restaurant service.",
        topics=["Hiring & training", "SOPs", "Opening & closing", "Inventory control", "Food safety", "Management reporting"],
        toc=["The People and the Operating System", "The Daily Service", "Stock, Safety and Control", "The Team, the Manager and the Owner", "The operating workbook"],
        pdf_url="https://customer-assets-rejwkqb3.emergentagent.net/job_business-wisdom-5/artifacts/be23f9292e92e800_Behind%20The%20Kitchen%20Door.pdf",
    ),
    Book(
        id="the-math-behind-the-menu",
        slug="the-math-behind-the-menu",
        title="The Math Behind the Menu",
        subtitle="The Numbers Every Restaurant Owner Must Know",
        author="Rakesh Chauhan",
        pages=65,
        selling_price_inr=249,
        original_price_inr=499,
        description="A numbers-first guide to food costing, pricing, contribution, break-even, cash flow and the financial decisions behind a restaurant.",
        topics=["Recipe costing", "Menu pricing", "Break-even", "Profit & loss", "Labour costs", "Cash flow"],
        toc=["The Model and the Menu", "Sales, Break Even and the Monthly Result", "People, Commitments and Channels", "Cash, Capital and the Owner", "The restaurant money workbook"],
        pdf_url="https://customer-assets-rejwkqb3.emergentagent.net/job_business-wisdom-5/artifacts/e9b1463636946099_The%20Math%20Behind%20The%20Menu.pdf",
    ),
    Book(
        id="empty-tables-to-full-house",
        slug="empty-tables-to-full-house",
        title="Empty Tables to Full House",
        subtitle="The Practical Guide to Getting More Customers and Building a Loyal Local Base",
        author="Rakesh Chauhan",
        pages=43,
        selling_price_inr=249,
        original_price_inr=499,
        description="A practical turnaround guide for understanding weak demand, improving visibility, shaping better offers and building a deliberate 30-day plan.",
        topics=["Diagnosing empty tables", "Indian brand lessons", "Local search", "Paid campaigns", "Offers", "30-day action plan"],
        toc=["Understand Your Restaurant", "Learn From Indian Brands", "Build a Business That Works", "Bring Customers In and Back", "Put the Plan to Work"],
        pdf_url="https://customer-assets-rejwkqb3.emergentagent.net/job_business-wisdom-5/artifacts/9b9264009bed08b4_Empty%20Tables%20To%20Full%20House%20.pdf",
    ),
]


@router.get("/catalogue", response_model=CatalogueResponse)
async def get_catalogue() -> CatalogueResponse:
    return CatalogueResponse(books=BOOKS)
