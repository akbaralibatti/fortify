import tkinter as tk

# Read password from file
with open("password.txt", "r") as f:
    PASSWORD = f.read().strip()

def check():
    if entry.get() == PASSWORD:
        root.destroy()
    else:
        entry.delete(0, tk.END)

root = tk.Tk()
root.attributes("-fullscreen", True)
root.configure(bg="black")

frame = tk.Frame(root, bg="black")
frame.pack(expand=True)

label = tk.Label(frame, text="DEVICE LOCKED", fg="white",
                 bg="black", font=("Arial", 40))
label.pack(pady=20)

entry = tk.Entry(frame, show="*", font=("Arial", 20))
entry.pack(pady=10)
entry.focus()

btn = tk.Button(frame, text="Unlock", command=check)
btn.pack(pady=10)

root.bind("<Return>", lambda e: check())

root.mainloop()
