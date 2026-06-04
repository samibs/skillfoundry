from fastapi import FastAPI

app = FastAPI()


class Item:
    pass


@app.post("/items")
def create_item(item: Item):
    return item


@app.get("/items/{item_id}")
def read_item(item_id: int):
    return item_id
