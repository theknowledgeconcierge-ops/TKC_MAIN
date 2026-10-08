from pydantic import BaseModel


class Book(BaseModel):
    id: str
    slug: str
    title: str
    subtitle: str
    author: str
    pages: int
    selling_price_inr: int
    original_price_inr: int
    description: str
    topics: list[str]
    toc: list[str]
    pdf_url: str
    cover_image_url: str


class CatalogueResponse(BaseModel):
    books: list[Book]
